# Deferred: packaging & installers (electron-builder)

**Status:** not implemented. `electron-builder` is in the root `devDependencies` so this
work has a home, but there is no `build` config and no `desktop:package` script yet. The
MVP is run-from-source only (`pnpm desktop`).

## Prerequisite

`bundled-runtime.md` must land first — an installer that assumes a system `node` on `PATH`
and a writable `process.cwd()` will not work on end-user machines.

## Sketch

Add a `build` block (own file `electron-builder.yml`, or a key in root `package.json`):

```yaml
appId: com.guilhermesalviano.koris
productName: koris
directories:
  output: dist-desktop-out
  buildResources: apps/desktop/build   # icons live here
files:
  - dist-desktop/**                     # compiled Electron shell
extraResources:
  - from: dist                          # compiled server
    to: server/dist
  - from: dist-web                      # SPA bundle
    to: server/dist-web
  - from: <pruned prod node_modules>    # incl. rebuilt better-sqlite3
    to: server/node_modules
mac:
  target: [dmg]
  category: public.app-category.productivity
  hardenedRuntime: true
  entitlements: apps/desktop/build/entitlements.mac.plist
  notarize: true                        # needs APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / TEAM_ID
win:
  target: [nsis]
  # signing: WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD
linux:
  target: [AppImage, deb]
  category: Utility
```

## Icons

`apps/desktop/build/` needs `icon.icns` (mac), `icon.ico` (win), `icon.png` 512px (linux),
plus a tray-sized template icon for `features/tray.ts`. Source can be `apps/web/public/logo.png`.

## Scripts to add

- `desktop:package`: `pnpm build && pnpm build:desktop && electron-builder`
- per-OS: `electron-builder --mac | --win | --linux`

## CI

Build the three targets on their native runners (macOS signing/notarization only works on
macOS). Publish to GitHub Releases so `features/auto-update.ts` can consume the same feed.
