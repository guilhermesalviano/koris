# `apps/desktop` — koris desktop app (Electron)

A thin Electron shell around the existing product. It does **not** reimplement the UI:
it manages the koris agent server and loads the existing web dashboard (`apps/web`, served
by `core/src/dashboard`) from `http://localhost:3000` in a native window. Chat streaming
(SSE), the setup wizard, and every admin page work exactly as they do in the browser.

Like `apps/web` and `apps/tui`, this folder has **no own `package.json`** — dependencies
live in the repo-root `package.json`, and it is built by its own `tsconfig.json`.

## Run it

```bash
pnpm install          # pulls electron + electron-builder
pnpm desktop          # pnpm build + pnpm build:desktop + launch Electron
```

- **Cold start:** nothing on port 3000 → the app spawns `node dist/core/src/app.js`
  (cwd = repo root), shows a splash until `/health` responds, then loads the dashboard.
  The spawned server is stopped when you quit.
- **Warm start:** if a koris server is already running (`pnpm app`), the app attaches to
  it and leaves it running on quit.

Other scripts: `pnpm build:desktop` (compile only), `pnpm desktop:dev` (skip the full
`pnpm build`, assumes `dist/` + `dist-web/` exist or a server is already up),
`pnpm lint:desktop` (type-check).

### Linux sandbox note

The `desktop` scripts pass `--no-sandbox` because Electron's Chromium sandbox needs
`node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox` to be
`root:root` mode `4755`, which a plain `pnpm install` can't set. To run *with* the
sandbox instead, fix that file once
(`sudo chown root:root <path> && sudo chmod 4755 <path>`) and drop the flag. The app
only ever loads trusted `http://localhost` content.

## Environment overrides

| Var | Default | Purpose |
| --- | --- | --- |
| `KORIS_DESKTOP_PORT` | `3000` | server port to probe / load |
| `KORIS_DESKTOP_HOST` | `localhost` | server host |
| `KORIS_DESKTOP_NODE` | `node` | Node binary used to spawn the server |
| `KORIS_DESKTOP_HEALTH_TIMEOUT_MS` | `90000` | how long to wait for a spawned server |
| `KORIS_DESKTOP_DEV` | — | `1` forces devtools + dev behaviour |

## Layout

| File | Role |
| --- | --- |
| `main.ts` | Electron entry: single-instance lock, `bootstrap()`, quit/cleanup |
| `config.ts` | ports, paths, dev detection |
| `server-process.ts` | probe `/health`, spawn + wait, stop on quit |
| `window.ts` | `BrowserWindow`, splash, external-link handling |
| `menu.ts` | minimal role-only window menu |
| `preload.ts` | tiny `window.koris` bridge |
| `loading.html` | splash shown while the server starts |
| `features/` | deferred features — each a stub with notes (see `features/README.md`) |
