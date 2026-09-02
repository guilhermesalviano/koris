import { BrowserWindow, shell } from 'electron';
import { SERVER_URL, loadingHtml, preloadScript } from './config';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'koris',
    backgroundColor: '#0e0e10',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadScript,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const internal =
      url.startsWith(SERVER_URL) || url.startsWith('file:') || url.startsWith('data:');
    if (!internal) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  mainWindow = win;
  return win;
}

export async function showLoading(win: BrowserWindow): Promise<void> {
  await win.loadFile(loadingHtml);
  win.show();
}

export async function showApp(win: BrowserWindow): Promise<void> {
  await win.loadURL(SERVER_URL);
}

export async function showError(win: BrowserWindow, message: string): Promise<void> {
  const html = `<!doctype html><meta charset="utf-8">
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0e0e10;color:#e7e7e7;padding:3rem;line-height:1.5">
  <h1 style="color:#F36246;font-size:1.25rem;margin:0 0 1rem">koris desktop — startup failed</h1>
  <pre style="white-space:pre-wrap;background:#17171a;border:1px solid #2a2a2e;border-radius:8px;padding:1rem;color:#c9c9c9">${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))}</pre>
  <p style="color:#8a8a8a">Run <code>pnpm build</code> and relaunch, or start the server yourself with <code>pnpm app</code> and reopen the app.</p>
</body>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.show();
}
