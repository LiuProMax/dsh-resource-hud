# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/LiuProMax/dsh-workspace-hud/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/LiuProMax/dsh-workspace-hud/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LiuProMax/dsh-workspace-hud/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LiuProMax/dsh-workspace-hud/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LiuProMax/dsh-workspace-hud/releases/tag/v1.0.0
