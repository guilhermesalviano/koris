# `apps/desktop/features/` — deferred desktop features

The first pass of the Electron app (`apps/desktop/`) is intentionally a thin shell:
it manages the koris server process and loads the existing web dashboard from
`http://localhost:3000` in a native window. Everything below is **not implemented yet**.
Each `.ts` file here compiles and exports a named no-op that logs a warning if called;
each `.md` file is a design note for work that touches packaging or other repos.

| File | Status | Summary |
| --- | --- | --- |
| `native-menu.ts` | stub (no-op) | Full application menu: New chat, open session, Settings/Providers/Skills/Heartbeats, docs & repo links, Check for updates. Replaces the minimal role-only menu in `apps/desktop/menu.ts`. |
| `tray.ts` | stub (no-op) | System-tray icon + quick actions (show/hide, new chat, quit); optional "close to tray". |
| `native-notifications.ts` | stub (no-op) | IPC channel `koris:notify`; renderer posts assistant-reply / heartbeat-output events, main raises an OS `Notification`; click focuses the window and routes to the session. Needs a small emitter added in `apps/web` (see note in the file). |
| `auto-update.ts` | stub (no-op) | `electron-updater` wiring: feed URL, check on launch + periodic, download / notify / quit-and-install. |
| `window-state.ts` | stub (no-op) | Persist window bounds + maximized/fullscreen + last route to `app.getPath('userData')` (e.g. `electron-store`), restore on launch. |
| `global-shortcut.ts` | stub (no-op) | Global hotkey to summon the window / a quick-ask popover. |
| `deep-links.ts` | stub (no-op) | Register the `koris://` protocol and route `koris://session/<id>`, `koris://setup`, etc. |
| `bundled-runtime.md` | design note | Ship a Node binary + `dist/` + `dist-web/` + pruned `node_modules` (prebuilt `better-sqlite3`) so the app runs with no system Node; make `dist-web/`, `memory/`, and `koris.json` paths relocatable (they are all keyed off `process.cwd()` today). |
| `packaging.md` | design note | `electron-builder` config per OS (macOS `dmg` + notarization, Windows `nsis`, Linux `AppImage`/`deb`), app icons, code signing, `files`/`extraResources` layout. |
| `api-base-url-seam.md` | design note | Only needed if we stop loading from `http://localhost:3000`: add a configurable API base URL to `apps/web/src/lib/api.ts` and switch `BrowserRouter` → `HashRouter`. |

## How to pick one up

1. Implement the exported function (keep the same name/signature).
2. Call it from `apps/desktop/main.ts` `bootstrap()` (or the relevant lifecycle hook).
3. Add any new dependency to the **root** `package.json` (`apps/desktop` has no own manifest,
   matching `apps/web` and `apps/tui`).
4. `pnpm lint:desktop` must stay green.
