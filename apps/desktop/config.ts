import { app } from 'electron';
import * as path from 'node:path';

const host = process.env.KORIS_DESKTOP_HOST || 'localhost';
const port = Number(process.env.KORIS_DESKTOP_PORT || '3000');

export const SERVER_URL = `http://${host}:${port}`;
export const HEALTH_URL = `${SERVER_URL}/health`;

export const HEALTH_TIMEOUT_MS = Number(process.env.KORIS_DESKTOP_HEALTH_TIMEOUT_MS || '90000');
export const HEALTH_POLL_INTERVAL_MS = 500;

export const isPackaged = app.isPackaged;
export const isDev = !isPackaged || process.env.KORIS_DESKTOP_DEV === '1';

// Dev: this module is compiled to <repoRoot>/apps/desktop/out/config.js, so the
// repo root is three directories up. Packaged: the server tree and Node runtime
// are shipped under the app's resources dir (see electron-builder.yml).
const devRepoRoot = path.resolve(__dirname, '..', '..', '..');

/** Read-only root holding the compiled server, dist-web/, skills/, core/load/. */
export const serverAppDir = isPackaged
  ? path.join(process.resourcesPath, 'server')
  : devRepoRoot;

/** Writable root for koris.json, memory/, logs/. Passed as KORIS_DATA_DIR. */
export const dataDir = isPackaged ? app.getPath('userData') : devRepoRoot;

export const serverEntry = path.join(serverAppDir, 'dist', 'core', 'src', 'app.js');
export const exampleConfig = path.join(serverAppDir, 'koris.example.json');

export const nodeBin = (() => {
  if (process.env.KORIS_DESKTOP_NODE) {
    return process.env.KORIS_DESKTOP_NODE;
  }
  if (!isPackaged) {
    return 'node';
  }
  const base = path.join(process.resourcesPath, 'node');
  return process.platform === 'win32'
    ? path.join(base, 'node.exe')
    : path.join(base, 'bin', 'node');
})();

export const loadingHtml = path.join(__dirname, 'loading.html');
export const preloadScript = path.join(__dirname, 'preload.js');
