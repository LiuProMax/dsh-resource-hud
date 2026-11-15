# How the Workspace HUD works

This page describes what the bundle mounts, how the card gets its data, and which
constraints shaped the implementation.

## Bundle anatomy

`package.json` declares two halves:

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true, "inject": ["…layout", "…sidebar-right"] }
}
```

- `dsh.bundle.patch` makes the package a **bundle**. `cordis.patch.yml` inserts one
  Loader row, `workspace-hud`, named `dsh-workspace-hud`.
- `dsh.client` makes the package a **browser module**. Harness composes it into
  `window.__DSH_BOOT__`, serves `client.js` under `/plugins`, and loads it
  through `window.__ModuleLoader__.load({ id, factory })`.
- `immediately` includes the module in the boot graph rather than loading it on
  first use.
- `inject` orders activation after the slot owners (`ui-layout` and
  `ui-sidebar-right`). It is ordering only; the component consumes services, not
  those modules.

The host half is a no-op `apply()`: it exists so a Loader row is mounted, which is
what makes Harness scan the package's `dsh.client` declaration in the first place.

## Client registration

```js
return {
  inject: ['slots', 'locale', 'sessions', 'sidebarRight', 'remote', 'remote.account', 'remote.workspaceFiles'],
  apply(ctx) { … },
};
```

Inside `apply`:

1. `ctx.locale.register('workspaceHud', { zh, en })` registers copy; the slot
   registration's `locale: NS` gives the component a bound `t`.
2. A `<style>` element is appended to `document.head` inside `ctx.effect`, so
   unloading the plugin removes it.
3. `ctx.slots.inject('shell.overlay', …)` waits for the overlay slot's declaration
   and registers the component with `ctx.slots.register`. Collapsing the slot
   disposes the registration; declaring it again reinstalls.

`shell.overlay` is a root-scoped `list` slot rendered inside the application
frame's overlay layer, above panels and the composer.

## Data flow

All reads go through services the Desktop composition already provides.

### Active session and workspace

`ctx.sessions.list` is an external store (`getSnapshot` + `subscribe`). The card
subscribes with `useSyncExternalStore` and picks the row retained by the main view
(`retainedBy.mainView > 0`). Its `cwd` is the workspace path; the card shows it
verbatim and matches other sessions against it with a case-insensitive comparison
on Windows.

### Files

`ctx.remote.workspaceFiles.list(sessionId, path, signal)` returns the direct
children of one directory (name, type, and size when the backend reports it).
The card starts at `.`, expands directories lazily, sorts directories before files
by name, and caps a level at 80 rows. A 8-second timer refreshes the root level
while the document is visible; the refresh button restarts the effect.

Clicking a file builds the standard Harness file address and hands it to the
sidebar:

```js
const encoded = path.split('/').map(encodeURIComponent).join('/');
ctx.sidebarRight.openResource(`dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`);
```

The address is identical to Harness's own `sessionFileAddress` helper, so the
right-side preview decides how to render it (text, image, PDF, …).

### Balance

The Desktop account controller validates a small client metadata object:

```js
{ version: '0.2.0-rc.2', locale, timezoneOffsetSeconds }
```

`getBalance(metadata)` answers `null` (signed out), `{ status: 'failed' }`, or
`{ status: 'ready', value: Wallet[], bonusWallets: Wallet[] }`, wrapped in the
usual `{ ok, value }` Remote result. `getProfile` supplies the display name.
The card refreshes every 60 seconds, on focus, and on demand.

### Token usage

The token-meter projection's **wire view** is its totals bucket, not its unit
state:

```js
// projection definition
wire: { viewSchema: projectionSchema, view: (state) => state.totals }
```

So a client reads `tokenUsage` as `{ uncachedInputTokens, outputTokens,
cacheReadTokens, cacheWriteTokens }`.

To count *every* session, including ones never opened, the card issues one
`ctx.remote.session.list({})` read. Each list item carries its projection block
(`projections.values.tokenUsage`) from the live registry or the projection cache.
The card then:

1. seeds a `Map<sessionId, { cwd, totals }>` from the list items (blank sessions
   are skipped),
2. overlays live `ctx.sessions.list` projection values for open sessions, so the
   running turn keeps incrementing between polls,
3. sums twice: every entry for **account**, entries whose `cwd` matches the
   current workspace for **workspace**.

The list read runs only while the card is expanded and visible, every 60 seconds,
and immediately after a refresh or re-expansion.

## Drag and persistence

The title bar handles `pointerdown` / `pointermove` / `pointerup`:

- `pointerdown` ignores hits inside buttons, measures the card's bounding rect,
  records the pointer offset, captures the pointer, and prevents text selection.
- `pointermove` moves the card to `pointer - offset`, clamped to
  `8 … innerWidth - width - 8` horizontally and
  `8 … innerHeight - height - 8` vertically (the card's own height), so the whole
  card stays on screen when it fits.
- `pointerup` releases capture.

The position switches the card from its default right/top anchoring to explicit
`left`/`top`. A double-click on the title bar clears the position back to the
default. A `resize` listener re-clamps a stored position.

`localStorage["dsh.workspace-hud.v1"]` stores
`{ open, hidden, x, y, tokenScope }`. Writes are skipped while a drag is in
flight, so a drag produces one write at `pointerup`.

## Failure behaviour

- The card never throws to the slot: remote calls are guarded, projections and
  wallets are optional, and formatters coerce invalid numbers to zero.
- A failed `session.list` falls back to the live session rows already loaded, so
  the workspace total remains visible.
- A failed file listing renders an inline retry action; a failed balance renders
  the "unavailable" state with no retry loop.

## Compatibility notes

- The browser half relies on the platform React module and plain DOM APIs; no
  Harness client package is imported.
- The account metadata version is pinned to the build the plugin was developed
  against (`0.2.0-rc.2`). If a later Harness changes the account contract, the
  balance section degrades to its unavailable state while the rest keeps working.
- `session.list` returning projection values is what makes the account total
  complete for cold sessions; a deployment that strips that field would still
  show live sessions and would undercount the rest.
