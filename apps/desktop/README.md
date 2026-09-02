# `apps/desktop` — koris desktop app (Electron)

A thin Electron shell around the existing product. It does **not** reimplement the UI:
it manages the koris agent server and loads the existing web dashboard (`apps/web`, served
by `core/src/dashboard`) from `http://localhost:3000` in a native window. Chat streaming
(SSE), the setup wizard, and every admin page work exactly as they do in the browser.

Unlike `apps/web` / `apps/tui`, this folder has its **own `package.json`** — not to add
dependencies (those stay in the repo root), but because `electron-builder` reads the
manifest of the dir it runs in and rejects the repo-root package name (`"/koris"`). It is
not a pnpm workspace package; `pnpm install` at the root ignores it.

## Run it (dev)

```bash
pnpm install
pnpm desktop          # pnpm build + pnpm build:desktop + launch Electron
```

- **Cold start:** nothing on port 3000 → the app spawns `node dist/core/src/app.js`
  (cwd = repo root), shows a splash until `/health` responds, then loads the dashboard.
  The spawned server is stopped when you quit.
- **Warm start:** if a koris server is already running (`pnpm app`), the app attaches to
  it and leaves it running on quit.

Other scripts: `pnpm build:desktop` (compile the shell → `apps/desktop/out/`),
`pnpm desktop:dev` (skip the full `pnpm build`), `pnpm lint:desktop` (type-check).

### Linux sandbox note

The `desktop` scripts pass `--no-sandbox` because Electron's Chromium sandbox needs
`node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox` to be
`root:root` mode `4755`, which a plain `pnpm install` can't set. To run *with* the
sandbox, fix that file once (`sudo chown root:root <path> && sudo chmod 4755 <path>`)
and drop the flag. The app only ever loads trusted `http://localhost` content.

## Packaging & releases

`electron-builder.yml` (repo root) + the scripts under `scripts/` produce installers with
the koris server and a standalone Node runtime bundled in, so the app runs with no system
Node.

```bash
pnpm desktop:package        # installers for the host OS  -> dist-desktop-out/
pnpm desktop:package:dir     # unpacked app (fast, no installer)
```

`desktop:package` runs, in order:

1. `pnpm build` + `pnpm build:desktop`
2. `pnpm desktop:stage` →
   - `scripts/stage-server.mjs`: a pruned production `node_modules` (+ `better-sqlite3`)
     into `build-resources/server-node_modules/`
   - `scripts/fetch-node.mjs`: a standalone Node (version pinned in the script) into
     `build-resources/node/`
3. `scripts/package-desktop.mjs`: runs `electron-builder` from `apps/desktop/` with the
   app version injected from the repo-root `package.json` and the exact installed Electron
   version.

**Packaged layout:** the Electron main bundle is in `app.asar`; the server tree
(`dist/`, `dist-web/`, `skills/`, `core/load/`, `heartbeats.default.json`,
`koris.example.json`, `node_modules/`) sits at `resources/server/`, and the Node runtime at
`resources/node/`. At runtime `config.ts` sets the spawned server's cwd to
`resources/server` and passes `KORIS_DATA_DIR` = the OS per-user data dir, so `koris.json`,
`memory/` and `logs/` are written there (the bundle stays read-only).

**GitHub releases:** `.github/workflows/release-desktop.yml` builds the matrix
(Linux / Windows / macOS x64 / macOS arm64) when a GitHub Release is **published**. It
takes the version from the release **tag** (`v0.1.4-pre` → `0.1.4-pre`, passed as
`KORIS_RELEASE_VERSION`) so the artifact names line up, builds with `--publish never`, then
attaches the installers to the triggering release with `gh release upload <tag> --clobber`.
Release flow: `pnpm release <bump>` → review → commit → `git tag vX.Y.Z` →
`git push --follow-tags` → publish the Release for that tag.

**Not done yet:** code signing / notarization (`identity: null`, unsigned) and app icons —
see `features/packaging.md`.

## Environment overrides

| Var | Default | Purpose |
| --- | --- | --- |
| `KORIS_DESKTOP_PORT` | `3000` | server port to probe / load |
| `KORIS_DESKTOP_HOST` | `localhost` | server host |
| `KORIS_DESKTOP_NODE` | `node` (dev) / bundled (packaged) | Node binary used to spawn the server |
| `KORIS_DESKTOP_HEALTH_TIMEOUT_MS` | `90000` | how long to wait for a spawned server |
| `KORIS_DESKTOP_DEV` | — | `1` forces devtools + dev behaviour |
| `KORIS_BUNDLE_NODE_VERSION` | pinned in `fetch-node.mjs` | Node version to bundle |

The server itself reads `KORIS_APP_DIR` (read-only root) and `KORIS_DATA_DIR` (writable
root) — the desktop app sets both; in dev they both equal the repo root, so behaviour is
unchanged.

## Layout

| Path | Role |
| --- | --- |
| `main.ts` | Electron entry: single-instance lock, `bootstrap()`, quit/cleanup, data-dir seeding |
| `config.ts` | ports, dev vs packaged path resolution, Node binary selection |
| `server-process.ts` | probe `/health`, spawn + wait, stop on quit |
| `window.ts` | `BrowserWindow`, splash, external-link handling |
| `menu.ts` | minimal role-only window menu |
| `preload.ts` | tiny `window.koris` bridge |
| `loading.html` | splash shown while the server starts |
| `package.json` | the Electron app manifest (electron-builder reads this) |
| `scripts/` | `stage-server.mjs`, `fetch-node.mjs`, `package-desktop.mjs` |
| `build/` | electron-builder build resources (icons — TODO) |
| `features/` | deferred features — each a stub with notes (see `features/README.md`) |
