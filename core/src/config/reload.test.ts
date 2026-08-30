/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { config, reloadConfig } from '.';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'koris-config-reload-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  // Restore the singleton to its real-repo state (no koris.json checked in).
  reloadConfig();
});

describe('config/index reloadConfig', () => {
  it('applies newly written koris.json values onto the existing config reference', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'koris.json'), JSON.stringify({ web_port: 4321, timezone: 'UTC' }));

    reloadConfig({ cwd: dir, dirname: dir });

    expect(config.WEB_PORT).toBe(4321);
    expect(config.TIMEZONE).toBe('UTC');
  });

  it('keeps the same object identity across a reload', () => {
    const before = config;
    const dir = createTempDir();
    writeFileSync(join(dir, 'koris.json'), JSON.stringify({ web_port: 5555 }));

    reloadConfig({ cwd: dir, dirname: dir });

    expect(config).toBe(before);
    expect(config.WEB_PORT).toBe(5555);
  });

  it('picks up nested AI/CHANNELS values after a reload', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'koris.json'), JSON.stringify({
      ai: {
        providers: [
          { provider: 'ollama', base_url: 'http://example.invalid:1234', api_token: '', models: ['reload-model'] },
        ],
        roles: { manager: { provider: 'ollama', model: 'reload-model' } },
      },
      channels: { allow_untrusted: true },
    }));

    reloadConfig({ cwd: dir, dirname: dir });

    expect(config.AI.MANAGER.BASE_URL).toBe('http://example.invalid:1234');
    expect(config.AI.MANAGER.MODEL).toBe('reload-model');
    expect(config.CHANNELS.ALLOW_UNTRUSTED).toBe(true);
  });

  it('auto-migrates a legacy ai.manager / ai.workers koris.json on reload', () => {
    const dir = createTempDir();
    writeFileSync(join(dir, 'koris.json'), JSON.stringify({
      ai: {
        manager: { provider: 'ollama', base_url: 'http://legacy.invalid:9999', model: 'legacy-manager' },
        workers: { provider: 'ollama', base_url: 'http://legacy.invalid:9999', model: 'legacy-worker', num_ctx: 8192 },
      },
    }));

    reloadConfig({ cwd: dir, dirname: dir });

    expect(config.AI.MANAGER.BASE_URL).toBe('http://legacy.invalid:9999');
    expect(config.AI.MANAGER.MODEL).toBe('legacy-manager');
    expect(config.AI.WORKERS.MODEL).toBe('legacy-worker');
    expect(config.AI.WORKERS.NUM_CTX).toBe(8192);
  });
});
