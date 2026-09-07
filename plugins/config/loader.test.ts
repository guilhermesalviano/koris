import { describe, expect, it } from 'vitest';
import { join, normalize } from 'path';
import { resolvePluginDir } from './loader';

describe('resolvePluginDir', () => {
  const cwd = '/repo';
  const fallbackDir = '/repo/dist/plugins/channels/whatsapp';

  it('returns the first candidate that already has a config.yml', () => {
    const dir = resolvePluginDir('whatsapp', {
      cwd,
      fallbackDir,
      exists: (p) => p === normalize(join(cwd, 'plugins', 'channels', 'whatsapp', 'config.yml')),
    });
    expect(dir).toBe(normalize(join(cwd, 'plugins', 'channels', 'whatsapp')));
  });

  it('prefers the KORIS_DATA_DIR candidate when it holds the file', () => {
    const dir = resolvePluginDir('whatsapp', {
      cwd,
      fallbackDir,
      dataDir: '/data',
      exists: (p) => p === normalize(join('/data', 'plugins', 'channels', 'whatsapp', 'config.yml')),
    });
    expect(dir).toBe(normalize(join('/data', 'plugins', 'channels', 'whatsapp')));
  });

  it('falls back to the writable data dir when nothing is written yet', () => {
    const dir = resolvePluginDir('whatsapp', {
      cwd,
      fallbackDir,
      dataDir: '/data',
      exists: () => false,
    });
    expect(dir).toBe(normalize(join('/data', 'plugins', 'channels', 'whatsapp')));
  });

  it('with no config anywhere and no dataDir, writes into the repo plugins tree, NOT dist/', () => {
    // Only the repo `plugins/channels` directory exists (no config.yml yet).
    const repoFamilyDir = normalize(join(cwd, 'plugins', 'channels'));
    const dir = resolvePluginDir('whatsapp', {
      cwd,
      fallbackDir,
      exists: (p) => p === repoFamilyDir,
    });
    expect(dir).toBe(normalize(join(cwd, 'plugins', 'channels', 'whatsapp')));
    expect(dir).not.toContain('dist');
  });

  it('falls back to fallbackDir only when not running inside a repo layout', () => {
    const dir = resolvePluginDir('whatsapp', {
      cwd,
      fallbackDir,
      exists: () => false,
    });
    expect(dir).toBe(normalize(fallbackDir));
  });
});
