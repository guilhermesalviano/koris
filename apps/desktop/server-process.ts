import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  HEALTH_POLL_INTERVAL_MS,
  HEALTH_TIMEOUT_MS,
  HEALTH_URL,
  nodeBin,
  repoRoot,
  serverEntry,
} from './config';

type Logger = (line: string) => void;

let managedChild: ChildProcess | null = null;

export interface EnsureServerResult {
  managed: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A koris server is considered "up" when /health answers with one of the two
 * status codes its handler can return (200 healthy, 500 degraded). Either means
 * the Express server is listening and serving the dashboard bundle.
 */
async function probeServer(timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    return res.status === 200 || res.status === 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureServer(log: Logger): Promise<EnsureServerResult> {
  if (await probeServer()) {
    log(`Attached to an existing koris server at ${HEALTH_URL}`);
    return { managed: false };
  }

  if (!existsSync(serverEntry)) {
    throw new Error(
      `koris server build not found at ${serverEntry}. Run \`pnpm build\` first.`,
    );
  }

  log(`Starting koris server: ${nodeBin} ${serverEntry}`);
  const child = spawn(nodeBin, [serverEntry], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  managedChild = child;

  child.stdout?.on('data', (chunk: Buffer) => log(`[server] ${chunk.toString().trimEnd()}`));
  child.stderr?.on('data', (chunk: Buffer) => log(`[server] ${chunk.toString().trimEnd()}`));
  child.on('exit', (code, signal) => {
    if (managedChild === child) {
      managedChild = null;
    }
    log(`koris server process exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`);
  });

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`koris server exited before becoming ready (code ${child.exitCode}).`);
    }
    if (await probeServer()) {
      log('koris server is ready.');
      return { managed: true };
    }
    await delay(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(`koris server did not become ready within ${HEALTH_TIMEOUT_MS}ms.`);
}

export async function stopServer(log: Logger): Promise<void> {
  const child = managedChild;
  managedChild = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  log('Stopping koris server...');
  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}
