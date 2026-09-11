import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpSyncService } from '../../../../src/services/mcps/mcp-sync';

vi.mock('../../../../src/services/plugins/plugin-catalog-singleton', () => ({
  PluginCatalogSingleton: { append: vi.fn() },
}));

const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
const roots: string[] = [];

function makeService(stored: boolean | null = null) {
  const root = mkdtempSync(path.join(tmpdir(), 'mcp-sync-'));
  roots.push(root);
  const sourceDir = path.join(root, 'src');
  const setup = vi.fn();
  const requireModule = vi.fn(() => ({ create: () => ({ name: 'coredash', setup }) }));
  const manager = { addDefinitions: vi.fn(async () => undefined) };
  const pluginSettings = { getEnabled: vi.fn(() => stored), setEnabled: vi.fn() };
  const service = new McpSyncService(logger, {
    sourceDir,
    distDir: path.join(root, 'dist'),
    context: {} as never,
    registry: { collect: vi.fn(() => []) } as never,
    manager: manager as never,
    pluginSettings,
    requireModule,
    transpile: (source) => source,
  }, []);
  return { service, sourceDir, requireModule, manager, pluginSettings };
}

function writePlugin(sourceDir: string, slug: string): void {
  mkdirSync(path.join(sourceDir, slug), { recursive: true });
  writeFileSync(path.join(sourceDir, slug, 'index.ts'), 'export {};');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('McpSyncService', () => {
  it('retries a plugin folder whose index.ts had not been written yet', async () => {
    const { service, sourceDir, requireModule, manager } = makeService();
    mkdirSync(path.join(sourceDir, 'coredash'), { recursive: true });

    await service.sync();
    expect(requireModule).not.toHaveBeenCalled();

    writeFileSync(path.join(sourceDir, 'coredash', 'index.ts'), 'export {};');
    await service.sync();

    expect(requireModule).toHaveBeenCalledOnce();
    expect(manager.addDefinitions).toHaveBeenCalledOnce();
  });

  it('enables a newly downloaded plugin before registering its definitions', async () => {
    const { service, sourceDir, manager, pluginSettings } = makeService(null);
    writePlugin(sourceDir, 'coredash');

    await service.sync();

    expect(pluginSettings.setEnabled).toHaveBeenCalledWith('mcps', 'coredash', true);
    expect(pluginSettings.setEnabled.mock.invocationCallOrder[0])
      .toBeLessThan(manager.addDefinitions.mock.invocationCallOrder[0]);
  });

  it('keeps an explicit earlier choice for a re-downloaded plugin', async () => {
    const { service, sourceDir, manager, pluginSettings } = makeService(false);
    writePlugin(sourceDir, 'coredash');

    await service.sync('coredash');

    expect(pluginSettings.setEnabled).not.toHaveBeenCalled();
    expect(manager.addDefinitions).toHaveBeenCalledOnce();
  });

  it('does not enable a folder that has not finished downloading', async () => {
    const { service, sourceDir, pluginSettings } = makeService(null);
    mkdirSync(path.join(sourceDir, 'coredash'), { recursive: true });

    await service.sync();

    expect(pluginSettings.setEnabled).not.toHaveBeenCalled();
  });
});
