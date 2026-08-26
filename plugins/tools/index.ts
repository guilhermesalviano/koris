import * as fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from '../registry';
import type { ToolPluginContext } from './contracts';

type PluginDirectoryEntry = Pick<fs.Dirent, 'name' | 'isDirectory'>;

interface ToolPluginModule {
  create?(context?: ToolPluginContext): Plugin | null;
}

interface CreateToolPluginsOptions {
  directory?: string;
  readdirSync?: (directory: string, options: { withFileTypes: true }) => PluginDirectoryEntry[];
  loadModule?: (modulePath: string) => ToolPluginModule;
  context?: ToolPluginContext;
}

function createToolPlugins(options: CreateToolPluginsOptions = {}): Plugin[] {
  const {
    directory = __dirname,
    readdirSync = fs.readdirSync as CreateToolPluginsOptions['readdirSync'],
    loadModule = (modulePath: string) => require(modulePath) as ToolPluginModule,
    context,
  } = options;

  return readdirSync!(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const mod = loadModule(path.join(directory, entry.name));
      if (typeof mod.create !== 'function') return [];
      const plugin = mod.create(context);
      return plugin ? [plugin] : [];
    });
}

export { createToolPlugins };
export { buildRegistry, PluginRegistry } from '../registry';
export type { Plugin };
