# Packaging & installers — IMPLEMENTED (unsigned)

`electron-builder.yml` (repo root) + `apps/desktop/scripts/` produce installers, and
`.github/workflows/release-desktop.yml` attaches them to GitHub Releases.

## Local

```bash
pnpm desktop:package        # host-OS installers -> dist-desktop-out/
pnpm desktop:package:dir     # unpacked app only (fast sanity check)
```

`package-desktop.mjs` runs `electron-builder` with `cwd = apps/desktop/` (so it reads
`apps/desktop/package.json`, not the repo-root `"/koris"` package which electron-builder
rejects), injecting `-c.extraMetadata.version` from the repo-root `package.json` and
`-c.electronVersion` from the installed Electron.

## CI → GitHub Releases

`release-desktop.yml` triggers on a Release being **published** (or `workflow_dispatch`
with a tag). Matrix:

| runner | output |
| --- | --- |
| `ubuntu-latest` | `.AppImage`, `.deb` |
| `windows-latest` | `.exe` (NSIS) |
| `macos-13` | `.dmg` (x64) |
| `macos-14` | `.dmg` (arm64) |

Each job: `pnpm build` → `pnpm build:desktop` → `pnpm desktop:stage` →
`electron-builder --publish always` (auth via the default `GITHUB_TOKEN`).

Release flow: `pnpm release <bump>` → review → commit → `git tag vX.Y.Z` →
`git push --follow-tags` → publish the Release for that tag (GitHub UI or
`gh release create vX.Y.Z --generate-notes`).

## Still TODO

### App icons
`apps/desktop/build/` has no icon yet — builds use the default Electron icon (a warning is
printed). Add `icon.icns` / `icon.ico` / `icon.png` (≥512px) there; source art can start
from `apps/web/public/logo.png` (only 128px today, needs redrawing).

### Code signing / notarization
Currently unsigned (`mac.identity: null`). Users get "unidentified developer" / SmartScreen
warnings. To enable, add to the workflow and repo secrets:

- **macOS:** `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`, and for notarization
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; set `mac.notarize: true` and
  drop `identity: null`. Add `apps/desktop/build/entitlements.mac.plist`.
- **Windows:** `CSC_LINK` / `CSC_KEY_PASSWORD` (or an Azure Trusted Signing / cloud HSM
  setup). electron-builder picks these up automatically.

### Auto-update
`features/auto-update.ts` is still a stub; once installers are signed, wire `electron-updater`
against the same GitHub Releases feed (`publish` block is already `provider: github`).
