# Workspace cost

The card shows an estimated **workspace cost** next to the token counters. It is an
estimate, not an invoice: the number comes from a price table multiplied by the
token increments the card observes.

The price table is calibrated from the **official DeepSeek pricing page** once a
week. The page publishes peak and off-peak rates per model; the plugin stores the
off-peak rates as the base and applies a peak multiplier inside the published
peak windows.

## Where the price table lives

The host half keeps a local copy at:

```
$DSH_HOME/workspace-hud/pricing.json      # default: ~/.dsh/workspace-hud/pricing.json
```

On first run, or whenever the copy is older than `refreshDays` (default **7**), the
host fetches the official page, parses it, and overwrites the file atomically
(keeping a `.bak`). The bundled fallback table is marked `"demo": true` and is
replaced by the first successful calibration.

A calibrated table looks like this:

```json
{
  "schema": 1,
  "currency": "USD",
  "unit": "per_million_tokens",
  "version": "official-2026-11-15",
  "demo": false,
  "utcOffsetMinutes": 480,
  "defaultModel": "deepseek-flash",
  "models": {
    "deepseek-flash": { "input": 0.15, "output": 0.6, "cacheRead": 0.003, "cacheWrite": 0 },
    "deepseek-v4-pro": { "input": 0.66, "output": 1.98, "cacheRead": 0.022, "cacheWrite": 0 }
  },
  "windows": [
    { "utcFrom": "09:00", "utcTo": "12:00", "multiplier": 2, "days": [1, 2, 3, 4, 5] },
    { "utcFrom": "14:00", "utcTo": "18:00", "multiplier": 2, "days": [1, 2, 3, 4, 5] }
  ],
  "holidays": [],
  "checkedAt": "2026-11-15T13:08:14.662Z",
  "source": "https://api-docs.deepseek.com/quick_start/pricing.md"
}
```

| Field | Meaning |
|---|---|
| `currency` | Display currency; `CNY` and `USD` get `¥` / `$`, anything else is shown as a code. |
| `models` | **Off-peak** rates per model for the four buckets; `input` is cache-miss input, `cacheRead` is cache-hit input. |
| `utcOffsetMinutes` | Wall-clock offset used to evaluate `windows` and `holidays`; the official page is converted to **Beijing time** (`480`). |
| `windows` | Peak windows in `utcOffsetMinutes` wall-clock time, multiplier applied to the base rates, optional `days` (0 = Sunday, 1 = Monday … 6 = Saturday). |
| `holidays` | Optional `YYYY-MM-DD` dates (in the same wall-clock zone) treated as off-peak for the whole day. |
| `demo` | When `true`, the card shows **sample rates**. |
| `checkedAt` / `source` | Written by the host after a successful calibration. |

The official page publishes **off-peak = half of peak**, so the base is off-peak
and the peak windows carry `multiplier: 2`. The official page states its peak
hours in UTC (01:00–04:00 and 06:00–10:00); the parser converts them to **Beijing
time** (09:00–12:00 and 14:00–18:00) and sets `utcOffsetMinutes: 480`.
`cacheWrite` is not charged separately on the official page and is stored as `0`.

## Every increment fetches the table first

Every `USAGE_REFRESH_MS` (60 s) the cost pass does this in order:

1. `GET /api/workspace-hud/pricing` — the host reads the local file **on every
   request** and calibrates it if it is stale or still the demo fallback.
2. `session.list` — the current per-session buckets.
3. The increment since the last baseline is priced with the rates **and the time
   coefficient in effect at that moment** (the session's model, the table's rates,
   and the peak/off-peak multiplier for the current **Beijing** weekday/time).
4. The cost is added to the workspace ledger in
   `localStorage["dsh.workspace-hud.cost.v1"]`.

Formula:

```
cost = Σ buckets × rate / 1_000_000 × multiplier
```

The first pass for a workspace seeds the ledger by pricing its **existing totals**
at the current rates, then records the buckets as the new baseline. A currency
change (for example demo CNY → official USD) starts a fresh ledger for that
workspace so amounts in two currencies are never added.

## Weekly calibration

The default source is the Markdown edition of the official page:

```
https://api-docs.deepseek.com/quick_start/pricing.md
```

The host parses:

- the model columns (`deepseek-flash`, `deepseek-v4-pro`);
- cache-hit, cache-miss, and output prices for `OFF-PEAK` and `PEAK`;
- the peak windows from the footnote (`01:00 - 04:00` and `06:00 - 10:00` UTC,
  Monday through Friday, excluding Chinese public holidays), converted to Beijing
  time as `09:00 - 12:00` and `14:00 - 18:00`.

The resulting table uses off-peak as the base and the peak/off-peak ratio as the
window multiplier. A failed fetch or a parse failure keeps the previous table and
reports the error; the card marks the prices stale.

Override the source (or point it at your own JSON table) in the plugin row config:

```yaml
- id: workspace-hud
  name: dsh-workspace-hud
  config:
    pricingSourceUrl: https://api-docs.deepseek.com/quick_start/pricing.md
    refreshDays: 7
    requestTimeoutMs: 15000
    # pricingFile: /absolute/path/to/pricing.json
```

Both the official Markdown page and a JSON price table are accepted.

## Accuracy

- Increments are attributed to the poll instant, not to the exact request time; a
  price change during a 60 s window is approximated.
- If the card is closed for a while, the missed tokens are priced at the next poll.
- The token projection has no per-model split; a session that switched models
  mid-way is priced with the last model's rates.
- Subagent sessions are not returned by `session.list`, so their usage is missing.
- Peak windows are evaluated in **Beijing time** (UTC+8), Monday–Friday.
  `holidays` defaults to empty, so Chinese public holidays are **not**
  automatically excluded; add dates (in Beijing time) to the table if you need
  that.
- The official page may change its layout; a parse failure falls back to the last
  good table.
- The result is an estimate in the table's currency (USD for the official page);
  the provider's invoice is authoritative.

## Privacy

The price table is public data. The calibration request sends no account, session,
or token data to the official page. The local route returns only the table, its
version, and the calibration time; it never returns the account, sessions, file
paths, or the absolute location of the local file.
