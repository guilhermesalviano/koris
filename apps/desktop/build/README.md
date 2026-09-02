# `apps/desktop/build/` — electron-builder build resources

`electron-builder.yml` points `directories.buildResources` here.

**App icons are not set yet** — builds currently fall back to the default Electron
icon (electron-builder prints a warning). To brand the app, drop in:

| File | Used for | Notes |
| --- | --- | --- |
| `icon.icns` | macOS | 512×512 (1024 retina) |
| `icon.ico` | Windows | multi-size, include 256×256 |
| `icon.png` | Linux | 512×512 (electron-builder also derives the others from this if the platform-specific file is absent) |

Source art can start from `apps/web/public/logo.png`, but that's only 128×128 —
regenerate at 512+ before using it here.

A tray template icon (`trayTemplate.png` / `@2x`) will also live here once
`features/tray.ts` is implemented.
