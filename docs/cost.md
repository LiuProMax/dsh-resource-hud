# Workspace cost

The card shows an estimated **workspace cost** next to the token counters. It is an
estimate, not an invoice: the number comes from a local price table multiplied by
the token increments the card observes.

## Where the price table lives

On first run the host half writes a table to:

```
$DSH_HOME/workspace-hud/pricing.json      # default: ~/.dsh/workspace-hud/pricing.json
```

It is a plain JSON file; edit it with any editor. The bundled table is marked
`"demo": true` and uses sample rates, so the card labels it **sample rates** until
you replace it.

```json
{
  "schema": 1,
  "currency": "CNY",
  "unit": "per_million_tokens",
  "version": "2026-11-15-demo",
  "demo": true,
  "defaultModel": "deepseek-flash",
  "models": {
    "deepseek-flash": { "input": 1, "output": 4, "cacheRead": 0.1, "cacheWrite": 0 }
  },
  "windows": [
    { "utcFrom": "16:30", "utcTo": "00:30", "multiplier": 0.5 }
  ]
}
```

| Field | Meaning |
|---|---|
| `currency` | Display currency; `CNY` and `USD` get `¥` / `$`, anything else is shown as a code. |
| `unit` | Must be `per_million_tokens`; all rates are in that unit. |
| `models` | Per-model rates for the four token buckets. |
| `defaultModel` | Model used when a session has no `modelSelection` yet. |
| `windows` | Optional UTC time windows with a multiplier (for off-peak pricing). |
| `demo` | When `true`, the card shows **sample rates**. |
| `checkedAt` | Written by the host after a successful calibration; do not edit. |
| `source` | The URL the table came from; written by the host. |

Rates must be non-negative numbers. `cacheWrite` is often free; put `0` if your
provider does not charge it separately.

## Weekly calibration

The host answers a read-only route:

```
GET /api/workspace-hud/pricing
```

On every read it checks `checkedAt`. If the table is missing or older than
`refreshDays` (default **7**), the host fetches `pricingSourceUrl`, validates the
result, and only then overwrites the local file. A failed fetch or an invalid
payload keeps the previous table and reports the error; the card keeps using the
old rates and marks them stale.

The default source is:

```
https://raw.githubusercontent.com/LiuProMax/dsh-workspace-hud/main/pricing.json
```

Override it in the plugin row config when you host your own table:

```yaml
- id: workspace-hud
  name: dsh-workspace-hud
  config:
    pricingSourceUrl: https://example.com/workspace-hud/pricing.json
    refreshDays: 7
    requestTimeoutMs: 15000
    # pricingFile: /absolute/path/to/pricing.json
```

## How an increment is priced

1. Every `USAGE_REFRESH_MS` (60 s) the card reads `session.list` and keeps the four
   token buckets per session.
2. For each session in the current workspace it subtracts the previous buckets
   stored in the ledger, giving the increment since the last pass.
3. The increment is priced with the rates **in effect at that moment**: the
   session's `modelSelection.lastUsed.model` (falling back to `defaultModel`),
   the table's rates, and the off-peak multiplier for the current UTC time.
4. The cost is added to the workspace ledger in
   `localStorage["dsh.workspace-hud.cost.v1"]`.

The first pass for a workspace seeds the ledger by pricing its **existing totals**
at today's rates, then records the buckets as the new baseline.

Formula:

```
cost = Σ buckets × rate / 1_000_000 × multiplier
```

## Accuracy

- Increments are attributed to the poll instant, not to the exact request time; a
  price change during a 60 s window is approximated.
- If the card is closed for a while, the missed tokens are priced at the next poll.
- The token projection has no per-model split; a session that switched models
  mid-way is priced with the last model's rates.
- Subagent sessions are not returned by `session.list`, so their usage is missing.
- Off-peak windows are UTC and apply to the whole increment.
- The result is an estimate; the provider's invoice is authoritative.

## Privacy

The price table is public data. The route returns only the table, its version,
and the calibration time; it never returns the account, sessions, file paths, or
the absolute location of the local file.
