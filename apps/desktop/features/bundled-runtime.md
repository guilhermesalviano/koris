# Deferred: bundled runtime (run without a system Node)

**Status:** not implemented. Today `apps/desktop/server-process.ts` spawns `node`
(`KORIS_DESKTOP_NODE` override) from the user's `PATH`, with `cwd` = repo root, and the
server reads/writes `dist-web/`, `memory/`, and `koris.json` relative to that cwd
(`config.BASE_DIR = process.cwd()`). That is fine for `pnpm desktop` on a dev machine;
it does not survive being packaged into an installer.

## What a packaged build needs

1. **A Node runtime inside the app.** Options, easiest first:
   - Ship a standalone Node binary in `extraResources` and point `KORIS_DESKTOP_NODE` at it.
   - Re-exec Electron itself with `ELECTRON_RUN_AS_NODE=1` and `process.execPath` — **but**
     then `better-sqlite3` loads against Electron's ABI, so it must be rebuilt with
     `@electron/rebuild` at packaging time. Trade-off: no separate binary, but a native
     rebuild step.
   - `sea` (Node single-executable) — heavier setup.

2. **Relocatable paths.** `process.cwd()` is not writable in a packaged app. Introduce an
   env-var / CLI seam in `core/src/config/index.ts` (or a wrapper entry) so the server can be
   told:
   - `dist-web/` location → inside `resources/` (read-only, in the asar-unpacked area or an
     `extraResources` dir).
   - `memory/` + `koris.json` location → `app.getPath('userData')` (writable, per-user).
   Right now these are all `path.resolve(config.BASE_DIR, ...)`; they need to become
   independently overridable.

3. **Bundle the server build + its prod deps.** `dist/`, `dist-web/`, and a pruned
   `node_modules` containing the compiled `better-sqlite3` (matched to whichever runtime
   option above was chosen) go into the packaged resources. `pnpm deploy --prod` or
   `pnpm --filter . deploy` can produce the pruned tree.

4. **First-run.** If no `koris.json` in userData, the SPA already redirects to `/setup`; make
   sure the server writes the finished config into the userData dir, not the app bundle.

See `packaging.md` for the electron-builder `files` / `extraResources` wiring that consumes
all of the above.
