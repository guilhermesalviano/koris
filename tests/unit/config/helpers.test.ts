/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { getConfigValue, loadConfigFile, resolveConfigPaths, toEnvKey } from '../../../src/config/helpers';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'koris-config-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('config/helpers', () => {
  it('reads apps/client/settings.json when running from the monorepo root', () => {
    const repoRoot = createTempDir();
    const appRoot = join(repoRoot, 'apps', 'client');
    const runtimeDir = join(appRoot, 'dist', 'src', 'config');

    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(appRoot, 'settings.json'), JSON.stringify({
      telegram: { BOT_TOKEN: 'test-token' },
    }));

    const fileConfig = loadConfigFile({ cwd: repoRoot, dirname: runtimeDir });

    expect(fileConfig).toEqual({
      telegram: { BOT_TOKEN: 'test-token' },
    });
  });

  it('prefers environment variables over file values', () => {
    const value = getConfigValue(
      'telegram.BOT_TOKEN',
      '',
      { telegram: { BOT_TOKEN: 'from-file' } },
      { TELEGRAM_BOT_TOKEN: 'from-env' },
    );

    expect(value).toBe('from-env');
  });

  it('maps dotted config paths to uppercase environment keys', () => {
    expect(toEnvKey('ai.ALLOW_REMOTE_BASE_URL')).toBe('AI_ALLOW_REMOTE_BASE_URL');
  });

  it('checks the monorepo apps/client settings path as a candidate', () => {
    const repoRoot = createTempDir();
    const runtimeDir = join(repoRoot, 'apps', 'client', 'src', 'config');

    const paths = resolveConfigPaths(repoRoot, runtimeDir);

    expect(paths).toContain(join(repoRoot, 'apps', 'client', 'settings.json'));
  });
});
