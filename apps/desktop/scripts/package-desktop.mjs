// Runs electron-builder from apps/desktop/ (so it reads apps/desktop/package.json
// — the repo-root package is named "/koris", which electron-builder rejects).
// The app version is injected from the repo-root package.json; any extra args
// (`--dir`, `--linux`, `--publish always`, ...) pass through.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appDir, '..', '..');
const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));

// electron-builder can't infer the electron version from a nested projectDir,
// so pass the exact version that's actually installed at the repo root.
const electronVersion = JSON.parse(
  readFileSync(resolve(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
).version;

const isWin = process.platform === 'win32';
const bin = resolve(repoRoot, 'node_modules', '.bin', isWin ? 'electron-builder.cmd' : 'electron-builder');

execFileSync(
  bin,
  [
    '--config', resolve(repoRoot, 'electron-builder.yml'),
    `-c.extraMetadata.version=${version}`,
    `-c.electronVersion=${electronVersion}`,
    ...process.argv.slice(2),
  ],
  { cwd: appDir, stdio: 'inherit', shell: isWin },
);
