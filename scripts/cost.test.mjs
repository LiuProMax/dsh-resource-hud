#!/usr/bin/env node
/**
 * Unit checks for the pure pricing helpers in the host half.
 *
 * These run without mounting the plugin: they cover schema validation, the UTC
 * off-peak windows, the per-million-token cost formula, and the weekly
 * calibration boundary.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PRICING, apply, deltaCost, isStale, multiplierAt, normalizePricing } from '../index.js';

const table = normalizePricing({
  ...DEFAULT_PRICING,
  windows: [{ utcFrom: '16:30', utcTo: '00:30', multiplier: 0.5 }],
});

const rates = table.models['deepseek-flash'];
assert.equal(rates.input, 1);
assert.equal(rates.output, 4);
assert.equal(rates.cacheRead, 0.1);
assert.equal(rates.cacheWrite, 0);

assert.throws(() => normalizePricing({ ...DEFAULT_PRICING, schema: 2 }), /schema/);
assert.throws(() => normalizePricing({ ...DEFAULT_PRICING, unit: 'per_token' }), /unit/);
assert.throws(() => normalizePricing({ ...DEFAULT_PRICING, currency: '' }), /currency/);
assert.throws(() => normalizePricing({
  ...DEFAULT_PRICING,
  models: { broken: { input: -1, output: 1, cacheRead: 0, cacheWrite: 0 } },
}), /input/);
assert.throws(() => normalizePricing({
  ...DEFAULT_PRICING,
  windows: [{ utcFrom: '25:00', utcTo: '00:30', multiplier: 0.5 }],
}), /utcFrom/);

const at = (iso) => new Date(iso);
assert.equal(multiplierAt(table, at('2026-11-15T17:00:00Z')), 0.5, 'inside the window');
assert.equal(multiplierAt(table, at('2026-11-15T12:00:00Z')), 1, 'outside the window');
assert.equal(multiplierAt(table, at('2026-11-16T00:00:00Z')), 0.5, 'overnight window');
assert.equal(multiplierAt(table, at('2026-11-16T00:30:00Z')), 1, 'window end is exclusive');

assert.equal(deltaCost({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, rates), 1);
assert.equal(deltaCost({ input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }, rates), 4);
assert.equal(deltaCost({ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 }, rates), 0.1);
assert.equal(deltaCost({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, rates, 0.5), 0.5);
assert.equal(deltaCost({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, rates, 0.5), 0);

const now = Date.parse('2026-11-15T08:00:00Z');
assert.equal(isStale({ checkedAt: '2026-11-09T08:00:00Z' }, now, 7), false, 'six days old is fresh');
assert.equal(isStale({ checkedAt: '2026-11-01T08:00:00Z' }, now, 7), true, 'fourteen days old is stale');
assert.equal(isStale({ checkedAt: null }, now, 7), true, 'never checked is stale');

/* ------------------------------------------------ host route and calibration */

const dir = await mkdtemp(join(tmpdir(), 'workspace-hud-'));
const file = join(dir, 'pricing.json');
const served = {
  ...DEFAULT_PRICING,
  version: 'route-test',
  demo: false,
  models: { 'deepseek-flash': { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 0 } },
};

const source = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(served));
});
await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
const sourceUrl = `http://127.0.0.1:${source.address().port}/pricing.json`;

const routes = new Map();
apply({
  webServer: {
    register(route) {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  },
  effect(fn) {
    return fn();
  },
}, { pricingFile: file, pricingSourceUrl: sourceUrl, refreshDays: 7, requestTimeoutMs: 3000 });

const route = routes.get('/api/workspace-hud/pricing');
assert.ok(route, 'the host must register the pricing route');

async function get(target = route) {
  const res = {
    status: 0,
    body: '',
    writeHead(status) { this.status = status; },
    end(chunk) { if (chunk) this.body += chunk; },
  };
  await target.handler({ method: 'GET' }, res);
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}

const first = await get();
assert.equal(first.status, 200);
assert.equal(first.body.pricing.version, 'route-test');
assert.equal(first.body.meta.calibrated, true);
const stored = JSON.parse(await readFile(file, 'utf8'));
assert.ok(stored.checkedAt, 'calibration must stamp checkedAt');
assert.equal(stored.models['deepseek-flash'].input, 2);

const second = await get();
assert.equal(second.body.meta.calibrated, false, 'a fresh table must not recalibrate');

stored.checkedAt = '2020-01-01T00:00:00.000Z';
await writeFile(file, JSON.stringify(stored, null, 2));
await new Promise((resolve) => source.close(resolve));
const offline = await get();
assert.equal(offline.status, 200);
assert.equal(offline.body.meta.stale, true);
assert.equal(offline.body.meta.calibrated, false);
assert.ok(offline.body.meta.error, 'an offline source must report an error');
assert.equal(offline.body.pricing.version, 'route-test', 'the old table must survive');

const bad = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ...served, schema: 2 }));
});
await new Promise((resolve) => bad.listen(0, '127.0.0.1', resolve));
const badRoutes = new Map();
apply({
  webServer: {
    register(route) {
      badRoutes.set(route.path, route);
      return () => badRoutes.delete(route.path);
    },
  },
  effect(fn) {
    return fn();
  },
}, { pricingFile: file, pricingSourceUrl: `http://127.0.0.1:${bad.address().port}/pricing.json`, refreshDays: 7, requestTimeoutMs: 3000 });

const invalid = await get(badRoutes.get('/api/workspace-hud/pricing'));
assert.equal(invalid.body.meta.stale, true);
assert.ok(invalid.body.meta.error);
assert.equal(invalid.body.pricing.version, 'route-test', 'invalid payloads must not overwrite the table');

await new Promise((resolve) => bad.close(resolve));
await rm(dir, { recursive: true, force: true });

console.log('workspace-hud cost checks passed (pure + host route)');
