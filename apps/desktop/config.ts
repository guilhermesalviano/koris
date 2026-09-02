import { app } from 'electron';
import * as path from 'node:path';

const host = process.env.KORIS_DESKTOP_HOST || 'localhost';
const port = Number(process.env.KORIS_DESKTOP_PORT || '3000');

export const SERVER_URL = `http://${host}:${port}`;
export const HEALTH_URL = `${SERVER_URL}/health`;

export const HEALTH_TIMEOUT_MS = Number(process.env.KORIS_DESKTOP_HEALTH_TIMEOUT_MS || '90000');
export const HEALTH_POLL_INTERVAL_MS = 500;

export const isDev = !app.isPackaged || process.env.KORIS_DESKTOP_DEV === '1';

export const nodeBin = process.env.KORIS_DESKTOP_NODE || 'node';

// This module is compiled to <repoRoot>/dist-desktop/config.js, so the repo
// root is one directory up from __dirname.
export const repoRoot = path.resolve(__dirname, '..');

export const serverEntry = path.join(repoRoot, 'dist', 'core', 'src', 'app.js');
export const loadingHtml = path.join(__dirname, 'loading.html');
export const preloadScript = path.join(__dirname, 'preload.js');
