/**
 * Host half of the workspace HUD bundle.
 *
 * The pinned card is rendered by the Client bundle (`client.js`). This half adds
 * the one thing a browser module cannot do: keep a local price table on disk and
 * refresh it from the official DeepSeek pricing page once a week, then expose it
 * to the card over a read-only route on the local Harness server:
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
 * The fallback table written on first run, before the official page has been
 * reached. It is deliberately marked `demo`; a successful calibration replaces
 * it with the official rates.
 */
export const DEFAULT_PRICING = {
  schema: 1,
  currency: 'CNY',
  unit: 'per_million_tokens',
  version: '2026-11-15-fallback',
  demo: true,
  note: 'Fallback sample rates only. The plugin calibrates the official DeepSeek pricing page weekly.',
  defaultModel: 'deepseek-flash',
  models: {
    'deepseek-flash': { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0 },
  },
  windows: [],
};

/**
 * Official pricing page, Markdown edition. The rendered page offers a "Copy
 * Markdown" action and the docs serve the same content at `.md`, which is far
 * easier to parse than the HTML shell.
 */
const DEFAULT_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing.md';

function parseClock(value, field) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof value === 'string' ? value : '');
  if (!match) throw new Error(`${field} must be HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function readRate(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return value;
}

function readDays(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array`);
  const days = [];
  for (const day of value) {
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error(`${field} must contain weekday numbers 0-6`);
    days.push(day);
  }
  return [...new Set(days)];
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
  const utcOffsetMinutes = raw.utcOffsetMinutes === undefined ? 0 : raw.utcOffsetMinutes;
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) {
    throw new Error('pricing utcOffsetMinutes must be an integer between -720 and 840');
  }

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
  if (Object.keys(models).length === 0) throw new Error('pricing must include at least one model');

  const windows = [];
  if (raw.windows !== undefined) {
    if (!Array.isArray(raw.windows)) throw new Error('pricing windows must be an array');
    for (const [index, window] of raw.windows.entries()) {
      if (!window || typeof window !== 'object') throw new Error(`pricing window ${index} must be an object`);
      const from = parseClock(window.utcFrom, `windows[${index}].utcFrom`);
      const to = parseClock(window.utcTo, `windows[${index}].utcTo`);
      const multiplier = readRate(window.multiplier, `windows[${index}].multiplier`);
      const days = window.days === undefined ? undefined : readDays(window.days, `windows[${index}].days`);
      windows.push({
        from,
        to,
        overnight: from > to,
        multiplier,
        ...(days === undefined ? {} : { days }),
      });
    }
  }

  const holidays = [];
  if (raw.holidays !== undefined) {
    if (!Array.isArray(raw.holidays)) throw new Error('pricing holidays must be an array');
    for (const day of raw.holidays) {
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new Error('pricing holidays must use YYYY-MM-DD');
      }
      holidays.push(day);
    }
  }

  return {
    schema: 1,
    currency: raw.currency.trim(),
    unit: 'per_million_tokens',
    defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : (Object.keys(models)[0] ?? ''),
    models,
    windows,
    holidays: [...new Set(holidays)],
    utcOffsetMinutes,
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

/**
 * Multiplier in effect at `date`. Base rates are the off-peak prices, so a peak
 * window carries the peak/off-peak ratio (2 for the official page). Window times
 * are wall-clock in the table's `utcOffsetMinutes` (Beijing, +480, for the
 * official page); a window may be limited to weekdays. A date listed in
 * `holidays` is treated as off-peak for the whole day.
 */
export function multiplierAt(pricing, date = new Date()) {
  const offset = pricing?.utcOffsetMinutes ?? 0;
  const shifted = new Date(date.getTime() + offset * 60_000);
  const key = shifted.toISOString().slice(0, 10);
  if (pricing?.holidays?.includes(key)) return 1;

  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const weekday = shifted.getUTCDay();
  let multiplier = 1;
  for (const window of pricing?.windows ?? []) {
    if (window.days && !window.days.includes(weekday)) continue;
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

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function modelName(cell) {
  return cell
    .replace(/\*+/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(cell) {
  const match = /-?\d+(?:\.\d+)?/.exec(String(cell).replace(/,/g, ''));
  if (!match) return null;
  return Number(match[0]);
}

function pricingKind(label) {
  if (/CACHE HIT/i.test(label)) return 'cacheRead';
  if (/CACHE MISS/i.test(label)) return 'input';
  if (/OUTPUT/i.test(label)) return 'output';
  return null;
}

/**
 * Parse the official "Models & Pricing" Markdown page.
 *
 * The page lists peak and off-peak prices for each model. The table is stored as
 * **off-peak** base rates plus peak windows whose multiplier is the
 * peak/off-peak ratio. The peak windows and the weekday restriction come from
 * the footnote ("Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday
 * through Friday ...").
 */
export function parseOfficialPricing(markdown) {
  if (typeof markdown !== 'string' || markdown.trim() === '') throw new Error('official pricing is empty');
  const lines = markdown.split(/\r?\n/);

  const header = lines.find((line) => /^\|/.test(line) && /MODEL/i.test(line) && /deepseek-/i.test(line));
  if (!header) throw new Error('official pricing header not found');
  const modelNames = splitRow(header)
    .map(modelName)
    .filter((name) => /^deepseek-[a-z0-9-]+$/i.test(name));
  if (modelNames.length === 0) throw new Error('official pricing models not found');

  const table = {};
  for (const line of lines) {
    if (!/^\|/.test(line) || !/PRICING/i.test(line)) continue;
    if (!/OFF-PEAK|PEAK/i.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length < 4) continue;
    const kind = pricingKind(cells[1]);
    if (!kind) continue;
    const period = /OFF-PEAK/i.test(cells[2]) ? 'off' : 'peak';
    for (const [index, name] of modelNames.entries()) {
      const price = parsePrice(cells[3 + index]);
      if (price === null) continue;
      table[name] ??= {};
      table[name][kind] ??= {};
      table[name][kind][period] = price;
    }
  }

  const models = {};
  let multiplier = 2;
  for (const name of modelNames) {
    const kinds = table[name];
    if (!kinds) continue;
    const input = kinds.input ?? {};
    const output = kinds.output ?? {};
    const cacheRead = kinds.cacheRead ?? {};
    if (input.off === undefined || output.off === undefined || cacheRead.off === undefined) continue;
    models[name] = {
      input: input.off,
      output: output.off,
      cacheRead: cacheRead.off,
      cacheWrite: 0,
    };
    if (input.off > 0 && input.peak > 0) {
      multiplier = Math.round((input.peak / input.off) * 10000) / 10000;
    }
  }
  if (Object.keys(models).length === 0) throw new Error('official pricing rows not found');

  const peak = /Peak hours are([\s\S]*?)(?:\n\n|$)/i.exec(markdown);
  const peakText = peak ? peak[1] : '';
  const ranges = [...peakText.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)];
  if (ranges.length === 0) throw new Error('official peak window not found');
  const weekdaysOnly = /Monday\s+through\s+Friday/i.test(peakText);
  // The official page states peak hours in UTC. The card evaluates them in
  // Beijing time (UTC+8), so convert each range: 01:00-04:00 UTC becomes
  // 09:00-12:00, 06:00-10:00 UTC becomes 14:00-18:00. These windows do not cross
  // midnight after conversion, so the weekday restriction is unchanged.
  const beijingOffset = 480;
  const windows = ranges.map((match) => {
    const from = (parseClock(match[1].padStart(5, '0'), 'peakFrom') + beijingOffset) % 1440;
    const to = (parseClock(match[2].padStart(5, '0'), 'peakTo') + beijingOffset) % 1440;
    return {
      utcFrom: formatClock(from),
      utcTo: formatClock(to),
      multiplier,
      ...(weekdaysOnly ? { days: [1, 2, 3, 4, 5] } : {}),
    };
  });

  const currency = /[¥￥]/.test(markdown) ? 'CNY' : 'USD';
  return {
    schema: 1,
    currency,
    unit: 'per_million_tokens',
    version: `official-${new Date().toISOString().slice(0, 10)}`,
    demo: false,
    note: 'Parsed from the official DeepSeek pricing page; peak windows are shown in Beijing time (UTC+8).',
    defaultModel: models['deepseek-flash'] ? 'deepseek-flash' : Object.keys(models)[0],
    models,
    windows,
    holidays: [],
    utcOffsetMinutes: beijingOffset,
  };
}

/** Accept either the official Markdown page or a JSON price table. */
export function parsePricingSource(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  if (trimmed.startsWith('#') || /deepseek-/i.test(trimmed)) return parseOfficialPricing(trimmed);
  throw new Error('unsupported pricing source format');
}

async function fetchText(url, timeoutMs) {
  if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this runtime');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/markdown, text/plain, application/json;q=0.8' },
    });
    if (!response.ok) throw new Error(`pricing source answered HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_SOURCE_BYTES) throw new Error('pricing source is too large');
    return text;
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
    const pricing = normalizePricing(parsePricingSource(await fetchText(sourceUrl, timeoutMs)));
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

    const needsCalibration = Boolean(sourceUrl)
      && (isStale(local, Date.now(), refreshDays) || local.source !== sourceUrl);
    if (!needsCalibration) {
      return {
        ok: true,
        pricing: local,
        meta: { stale: isStale(local, Date.now(), refreshDays), calibrated: false, localInvalid },
      };
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
