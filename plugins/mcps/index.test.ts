import { describe, expect, it, vi } from 'vitest';
import { createMcpPlugins } from './index';

describe('createMcpPlugins', () => {
  it('loads plugin directories and isolates module failures', () => {
    const onLoadError = vi.fn();
    const plugins = createMcpPlugins({
      directory: __dirname,
      readdirSync: () => [
        { name: 'good', isDirectory: () => true },
        { name: 'broken', isDirectory: () => true },
        { name: 'contracts.ts', isDirectory: () => false },
      ],
      loadModule: (modulePath) => {
        if (modulePath.endsWith('broken')) throw new Error('boom');
        return { create: () => ({ name: 'good', setup: vi.fn() }) };
      },
      onLoadError,
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual(['good']);
    expect(onLoadError).toHaveBeenCalledWith('broken', expect.any(Error));
  });
});
