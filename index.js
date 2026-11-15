/**
 * Host half of the workspace HUD bundle.
 *
 * The pinned card is rendered by the Client bundle (`client.js`). This half adds
 * the one thing a browser module cannot do: keep a local price table on disk and
 * refresh it from the network once a week, then expose it to the card over a
 * read-only route on the local Harness server:
 *
 *   GET /api/workspace-hud/pricing
 *
 * The route never returns personal data: it carries the price table, its
 * version, and the last successful calibration time.
 */
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const ROUTE_PATH = '/api/workspace-hud/pricing';
const MILLION = 1_000_000;
const DAY_MS = 86_400_000;
const MAX_SOURCE_BYTES = 256 * 1024;

/**
 * The price table written on first run. Rates are per million tokens and are
 * deliberately marked `demo`: replace them with the provider's current prices
 * before treating the estimate as more than a sample.
 */
export const DEFAULT_PRICING = {
  schema: 1,
  currency: 'CNY',
  unit: 'per_million_tokens',
  version: '2026-11-15-demo',
  demo: true,
  note: 'Sample rates for the cost estimate. Replace them with the current prices of your provider.',
  defaultModel: 'deepseek-flash',
  models: {
    'deepseek-flash': { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0 },
  },
  windows: [],
};

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/LiuProMax/dsh-workspace-hud/main/pricing.json';

function parseClock(value, field) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof value === 'string' ? value : '');
  if (!match) throw new Error(`${field} must be HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function readRate(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return value;
}

/**
 * Validate and normalize a price table coming from disk or the network.
 * Throws on malformed input so a broken source never overwrites a good table.
 */
export function normalizePricing(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('pricing must be an object');
  if (raw.schema !== 1) throw new Error('unsupported pricing schema');
  if (raw.unit !== 'per_million_tokens') throw new Error('pricing unit must be per_million_tokens');
  if (typeof raw.currency !== 'string' || raw.currency.trim() === '') throw new Error('pricing currency is required');

  const models = {};
  if (raw.models !== undefined) {
    if (!raw.models || typeof raw.models !== 'object' || Array.isArray(raw.models)) {
      throw new Error('pricing models must be an object');
    }
    for (const [name, rates] of Object.entries(raw.models)) {
      if (!name.trim()) throw new Error('pricing model names must not be empty');
      if (!rates || typeof rates !== 'object') throw new Error(`pricing model "${name}" must be an object`);
      models[name] = {
        input: readRate(rates.input, `${name}.input`),
        output: readRate(rates.output, `${name}.output`),
        cacheRead: readRate(rates.cacheRead, `${name}.cacheRead`),
        cacheWrite: readRate(rates.cacheWrite, `${name}.cacheWrite`),
      };
    }
  }

  const windows = [];
  if (raw.windows !== undefined) {
    if (!Array.isArray(raw.windows)) throw new Error('pricing windows must be an array');
    for (const [index, window] of raw.windows.entries()) {
      if (!window || typeof window !== 'object') throw new Error(`pricing window ${index} must be an object`);
      const from = parseClock(window.utcFrom, `windows[${index}].utcFrom`);
      const to = parseClock(window.utcTo, `windows[${index}].utcTo`);
      const multiplier = readRate(window.multiplier, `windows[${index}].multiplier`);
      windows.push({ from, to, overnight: from > to, multiplier });
    }
  }

  return {
    schema: 1,
    currency: raw.currency.trim(),
    unit: 'per_million_tokens',
    defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : (Object.keys(models)[0] ?? ''),
    models,
    windows,
    version: typeof raw.version === 'string' ? raw.version : '',
    demo: raw.demo === true,
    note: typeof raw.note === 'string' ? raw.note : '',
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
    source: typeof raw.source === 'string' ? raw.source : null,
  };
}

/** Whether the last successful calibration is older than `refreshDays`. */
export function isStale(pricing, now = Date.now(), refreshDays = 7) {
  const at = Date.parse(pricing?.checkedAt ?? '');
  return !Number.isFinite(at) || now - at > refreshDays * DAY_MS;
}

/** Discount multiplier (1 unless a window covers `date`). Windows are UTC. */
export function multiplierAt(pricing, date = new Date()) {
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  let multiplier = 1;
  for (const window of pricing?.windows ?? []) {
    const active = window.overnight
      ? minutes >= window.from || minutes < window.to
      : minutes >= window.from && minutes < window.to;
    if (active) multiplier = window.multiplier;
  }
  return multiplier;
}

/** Cost of one token increment, in the price table's currency. */
export function deltaCost(tokens, rates, multiplier = 1) {
  if (!rates) return 0;
  const units = (
    (tokens.input ?? 0) * rates.input +
    (tokens.output ?? 0) * rates.output +
    (tokens.cacheRead ?? 0) * rates.cacheRead +
    (tokens.cacheWrite ?? 0) * rates.cacheWrite
  ) / MILLION;
  return units * multiplier;
}

async function fetchJson(url, timeoutMs) {
  if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this runtime');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`pricing source answered HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_SOURCE_BYTES) throw new Error('pricing source is too large');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function persistPricing(file, pricing) {
  await mkdir(dirname(file), { recursive: true });
  const serialized = `${JSON.stringify(pricing, null, 2)}\n`;
  const temporary = `${file}.tmp`;
  await writeFile(temporary, serialized, 'utf8');
  try {
    await copyFile(file, `${file}.bak`);
  } catch {
    /* the first write has no previous file */
  }
  await rename(temporary, file);
}

export function apply(ctx, config = {}) {
  const settings = config && typeof config === 'object' ? config : {};
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  const file = typeof settings.pricingFile === 'string' && settings.pricingFile
    ? settings.pricingFile
    : join(home, 'workspace-hud', 'pricing.json');
  const sourceUrl = typeof settings.pricingSourceUrl === 'string'
    ? settings.pricingSourceUrl
    : DEFAULT_SOURCE;
  const refreshDays = Number(settings.refreshDays) > 0 ? Number(settings.refreshDays) : 7;
  const timeoutMs = Number(settings.requestTimeoutMs) > 0 ? Number(settings.requestTimeoutMs) : 15_000;

  let inflight = null;

  const ensureLocal = async () => {
    try {
      await readFile(file, 'utf8');
      return;
    } catch {
      /* first run, or the file was deleted */
    }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ ...DEFAULT_PRICING, checkedAt: null }, null, 2)}\n`, 'utf8');
  };

  const readLocal = async () => {
    await ensureLocal();
    const text = await readFile(file, 'utf8');
    return normalizePricing(JSON.parse(text));
  };

  const calibrate = async () => {
    if (!sourceUrl) throw new Error('no pricing source configured');
    const pricing = normalizePricing(await fetchJson(sourceUrl, timeoutMs));
    pricing.checkedAt = new Date().toISOString();
    pricing.source = sourceUrl;
    await persistPricing(file, pricing);
    return pricing;
  };

  const loadPricing = async () => {
    let local;
    let localInvalid = false;
    try {
      local = await readLocal();
    } catch (error) {
      localInvalid = true;
      local = normalizePricing(DEFAULT_PRICING);
    }

    const stale = isStale(local, Date.now(), refreshDays);
    if (!stale) {
      return { ok: true, pricing: local, meta: { stale: false, calibrated: false, localInvalid } };
    }

    if (!inflight) {
      inflight = calibrate().finally(() => {
        inflight = null;
      });
    }
    try {
      const pricing = await inflight;
      return { ok: true, pricing, meta: { stale: false, calibrated: true, localInvalid } };
    } catch (error) {
      return {
        ok: true,
        pricing: local,
        meta: {
          stale: true,
          calibrated: false,
          error: String(error?.message ?? error),
          localInvalid,
        },
      };
    }
  };

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
      }
      try {
        const body = JSON.stringify(await loadPricing());
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body),
        });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch (error) {
        const body = JSON.stringify({ ok: false, error: String(error?.message ?? error) });
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
        res.end(body);
      }
    },
  }), 'workspace-hud: pricing route');
}

export const inject = ['webServer'];
