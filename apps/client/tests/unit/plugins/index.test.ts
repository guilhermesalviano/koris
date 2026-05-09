import { describe, expect, it, vi } from 'vitest';
import type { ChannelDefinition } from '../../../src/channels';
import { ADAPTERS } from '../../../src/channels';
import { createPlugins, buildRegistry, type Plugin } from '../../../plugins';

function makeEntry(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir };
}

describe('createPlugins', () => {
  it('returns plugins from subdirectories that export create()', () => {
    const pluginA: Plugin = { name: 'a', setup: vi.fn() };
    const pluginB: Plugin = { name: 'b', setup: vi.fn() };

    const readdirSync = vi.fn().mockReturnValue([
      makeEntry('plugin-a', true),
      makeEntry('plugin-b', true),
    ]);
    const loadModule = vi.fn()
      .mockReturnValueOnce({ create: () => pluginA })
      .mockReturnValueOnce({ create: () => pluginB });

    const result = createPlugins({ directory: '/fake', readdirSync, loadModule });

    expect(result).toEqual([pluginA, pluginB]);
    expect(loadModule).toHaveBeenCalledWith('/fake/plugin-a');
    expect(loadModule).toHaveBeenCalledWith('/fake/plugin-b');
  });

  it('skips non-directory entries', () => {
    const plugin: Plugin = { name: 'real', setup: vi.fn() };

    const readdirSync = vi.fn().mockReturnValue([
      makeEntry('index.ts', false),
      makeEntry('real-plugin', true),
      makeEntry('README.md', false),
    ]);
    const loadModule = vi.fn().mockReturnValue({ create: () => plugin });

    const result = createPlugins({ directory: '/fake', readdirSync, loadModule });

    expect(result).toEqual([plugin]);
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(loadModule).toHaveBeenCalledWith('/fake/real-plugin');
  });

  it('skips modules that do not export create()', () => {
    const plugin: Plugin = { name: 'valid', setup: vi.fn() };

    const readdirSync = vi.fn().mockReturnValue([
      makeEntry('no-create', true),
      makeEntry('valid-plugin', true),
    ]);
    const loadModule = vi.fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ create: () => plugin });

    const result = createPlugins({ directory: '/fake', readdirSync, loadModule });

    expect(result).toEqual([plugin]);
  });

  it('returns an empty array when the directory has no subdirectories', () => {
    const readdirSync = vi.fn().mockReturnValue([
      makeEntry('index.ts', false),
    ]);
    const loadModule = vi.fn();

    const result = createPlugins({ directory: '/fake', readdirSync, loadModule });

    expect(result).toEqual([]);
    expect(loadModule).not.toHaveBeenCalled();
  });

  it('returns an empty array when the directory is empty', () => {
    const readdirSync = vi.fn().mockReturnValue([]);
    const loadModule = vi.fn();

    const result = createPlugins({ directory: '/fake', readdirSync, loadModule });

    expect(result).toEqual([]);
  });
});


describe('plugins', () => {
  it('merges contributions across plugins', () => {
    const telegram: ChannelDefinition = {
      name: 'telegram',
      enabled: () => true,
      start: () => undefined,
    };
    const slack: ChannelDefinition = {
      name: 'slack',
      enabled: () => true,
      start: () => undefined,
    };
    const plugins: Plugin[] = [
      {
        name: 'notifications',
        setup(registry) { registry.extend(ADAPTERS, telegram); },
      },
      {
        name: 'support',
        setup(registry) { registry.extend(ADAPTERS, slack); },
      },
    ];

    const registry = buildRegistry(plugins);

    expect(registry.collect(ADAPTERS)).toEqual([telegram, slack]);
  });
});
