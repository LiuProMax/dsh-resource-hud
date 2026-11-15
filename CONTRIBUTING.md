# Contributing

Thanks for taking the time to improve the Workspace HUD. This is a small plugin,
so the process is intentionally light.

## Before you start

- Open an issue for anything beyond a typo or a one-line fix, so the approach can
  be agreed on before code is written.
- The plugin targets the Harness Desktop Web UI. Behaviour that depends on a
  Harness version should say which version it was verified against.

## Local setup

No build step and no runtime dependencies are required.

```bash
git clone https://github.com/LiuProMax/dsh-workspace-hud.git
cd dsh-workspace-hud
npm run check
node --check index.js
node --check client.js
```

To exercise a change in a running Desktop app, copy the package into the profile
with `install.ps1` (Windows) or `install.sh` (macOS/Linux). Harness's client HMR
polls installed bundles, so the card is replaced in place without a restart.

## Code guidelines

- **Plain JavaScript only.** The browser half is loaded as-is by Harness's module
  loader; there is no bundler.
- **No Harness client packages.** Do not `require('@deepseek-ai/dsh-client-*')`.
  Copy the small amount of markup or CSS you need instead.
- **Theme tokens only.** Use `--dsw-alias-*` / `--dsw-font-*` tokens; literal
  colors are only acceptable inside artwork such as `icon.svg`.
- **Public services only.** Read data through `ctx.sessions`, `ctx.remote.*`, and
  the registries the composition already provides. Do not reach into another
  plugin's DOM or internal stores.
- **Stay inside `apply`.** Register slots, styles, listeners, and timers with
  `ctx.effect` / `ctx.slots.inject` so unloading the plugin removes everything.
- **Never let the card crash the slot.** Guard optional data; a thrown component
  removes the whole overlay entry.

## Pull requests

Please keep a PR focused and include:

- what changed and why, with a screenshot or a short recording for visual work;
- the Harness version and theme(s) you verified;
- confirmation that `npm run check` and both `node --check` commands pass;
- a `CHANGELOG.md` entry under `[Unreleased]` for user-visible changes.

By contributing you agree that your contribution is licensed under the
repository's MIT license.
