# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.2] - 2026-11-16

### Fixed

- The cost pass now reuses the usage snapshot instead of issuing a second
  `session.list` call, which could collide with the usage poll and leave the cost
  row stuck at "reading prices". The card now shows the official cost.

## [1.4.1] - 2026-11-15

### Added

- A built-in **2026 Chinese public holiday** calendar (33 dates, Beijing time) so
  peak windows are evaluated as off-peak on holidays, matching the official page's
  "excluding Chinese public holidays" rule. Source:
  [国务院办公厅关于2026年部分节假日安排的通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm).
- `holidays` is part of the calibrated table; a JSON source can override it for
  other years or regions.

### Changed

- Project renamed to **DSH-资源统计弹窗**; the repository moved to
  `LiuProMax/dsh-resource-hud` and the card title follows the new name.

## [1.4.0] - 2026-11-15

### Changed

- Cost passes now fetch the price table **before** every increment calculation
  (60 s), so each delta is priced with the rates and the time coefficient in effect
  at that moment instead of a table cached for five minutes.
- The price table is calibrated from the **official DeepSeek pricing page**
  (`https://api-docs.deepseek.com/quick_start/pricing.md`) once a week. The host
  parses the model rates, the peak/off-peak ratio, and the peak windows (01:00–04:00
  and 06:00–10:00 UTC, Monday–Friday), converts them to **Beijing time**
  (09:00–12:00 and 14:00–18:00), and stores the off-peak rates as the base plus
  weekday-limited peak windows.
- The schema gained `utcOffsetMinutes`, `windows[].days`, and `holidays`; the client's
  multiplier respects all three. A demo table from a different source triggers an
  immediate calibration, and a currency change starts a fresh ledger.

## [1.3.0] - 2026-11-15

### Added

- Estimated **workspace cost**: every 60 seconds the card prices the new token
  increments with the rates effective at that moment and adds them to a
  per-workspace ledger.
- A host-side price table at `$DSH_HOME/workspace-hud/pricing.json` with per-model
  rates and optional UTC off-peak windows, served over
  `GET /api/workspace-hud/pricing` and calibrated from a configurable URL once a
  week (or whenever `checkedAt` is older than `refreshDays`).
- `npm test` covers schema validation, off-peak windows, the cost formula, and the
  calibration boundary.

### Notes

- The bundled rates are sample values marked `"demo": true`; the card labels them
  as sample rates. Replace them with your provider's prices before relying on the
  number.

## [1.2.0] - 2026-11-15

### Changed

- Token usage is now a comparison table: `合计`, input, output, cache read, and
  cache write for **account** and **workspace** are shown side by side instead
  of switching a shared breakdown with a scope toggle.

## [1.1.0] - 2026-11-15

### Added

- Draggable card: drag the title bar to move it, double-click to reset, position
  persisted in `localStorage` and clamped to the viewport on resize.
- Token usage split into **account** (every session on this device) and
  **workspace** (sessions sharing the current working directory), with a
  selectable breakdown per scope.
- Session token usage now comes from one `session.list` read, so cold sessions
  are counted without opening them.

### Changed

- Package renamed to `dsh-workspace-hud` for standalone installation from GitHub.
- The hidden-state pill now appears at the card's saved position.

## [1.0.0] - 2026-11-15

### Added

- Pinned `shell.overlay` card with workspace files, account balance, and
  workspace token usage.
- Expandable file tree with click-to-preview, 8-second refresh.
- Account balance with bonus credit, account name, and refresh on focus.
- Collapse and hide controls, persisted per browser.

[Unreleased]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LiuProMax/dsh-resource-hud/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LiuProMax/dsh-resource-hud/releases/tag/v1.0.0
