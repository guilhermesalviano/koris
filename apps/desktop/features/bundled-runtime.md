# Bundled runtime — IMPLEMENTED

The packaged desktop app runs the koris server with **no system Node**. How it fits together:

## What gets bundled

`scripts/stage-server.mjs` + `scripts/fetch-node.mjs` (run by `pnpm desktop:stage`) produce:

- `build-resources/server-node_modules/` — a pruned **production** `node_modules`. Built by
  installing a stripped manifest (`dependencies` only, `pnpm.onlyBuiltDependencies:
  [better-sqlite3]`) with `pnpm install --prod --ignore-workspace`. `better-sqlite3` v13
  ships per-platform `prebuilds/*.node` for every OS/arch, so one staged tree works on all
  targets — no cross-compilation.
- `build-resources/server-package.json` — that stripped manifest.
- `build-resources/node/` — a standalone Node binary downloaded from nodejs.org
  (`bin/node` on macOS/Linux, `node.exe` on Windows). Version pinned in `fetch-node.mjs`
  (`KORIS_BUNDLE_NODE_VERSION` to override), kept `>= 24` to match `engines.node`.

`electron-builder.yml` `extraResources` copies these plus `dist/`, `dist-web/`, `skills/`,
`core/load/`, `heartbeats.default.json`, `koris.example.json` into `resources/server/` and
the Node runtime into `resources/node/`, alongside `app.asar` (i.e. **outside** the asar,
so the native `.node` files load normally).

## Relocatable paths — the `core/src/config` change

`config.BASE_DIR` used to be `process.cwd()` and anchored both read-only assets and writable
state. It's now split:

| | env var | default | holds |
| --- | --- | --- | --- |
| `config.BASE_DIR` | `KORIS_APP_DIR` | `process.cwd()` | read-only: `dist-web/`, `skills/`, `heartbeats.default.json`, `core/load/` |
| `config.DATA_DIR` | `KORIS_DATA_DIR` | `process.cwd()` | writable: `koris.json`, `memory/`, `logs/` |

`resolveConfigPaths()` / the settings-writer default their `cwd` to
`resolveDataDir()` (`KORIS_DATA_DIR || process.cwd()`). In a normal checkout both env vars
are unset, so everything still resolves to the repo root — no behaviour change, all tests
green.

`apps/desktop`:
- spawns the server with `cwd = resources/server`, `KORIS_APP_DIR = resources/server`,
  `KORIS_DATA_DIR = app.getPath('userData')`.
- `main.ts` `seedDataDir()` copies the bundled `koris.example.json` into the data dir on
  each launch (the setup wizard patches from it; the "configured" check only looks for
  `koris.json`, so seeding the example is harmless).
- pre-creates `<dataDir>/memory` and `<dataDir>/logs`.
- points `CHANNELS_WHATSAPP_AUTH_FOLDER` at the data dir too.

## Known gaps

- Saving **channel plugin secrets** (`plugins/<family>/<name>/config.yml`) still writes
  relative to the server cwd (read-only in a packaged app). Channels are opt-in and
  disabled by default; wire a `KORIS_DATA_DIR`-based path into `plugins/config/writer.ts`
  before promoting channel setup as a first-class packaged feature.
- `pnpm onboard` / `pnpm validate` (separate CLIs) still use `process.cwd()` — fine, they
  aren't run inside the packaged app.
