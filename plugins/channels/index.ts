import * as fs from 'node:fs';
import path from 'node:path';
import { PluginRegistry, buildRegistry, type Plugin } from '../registry';
import type { PluginContext } from './contracts';

type PluginDirectoryEntry = Pick<fs.Dirent, 'name' | 'isDirectory'>;

interface PluginModule {
  create?(context?: PluginContext): Plugin | null;
}

interface CreatePluginsOptions {
  directory?: string;
  readdirSync?: (directory: string, options: { withFileTypes: true }) => PluginDirectoryEntry[];
  loadModule?: (modulePath: string) => PluginModule;
  context?: PluginContext;
}

function createPlugins(options: CreatePluginsOptions = {}): Plugin[] {
  const {
    directory = __dirname,
    readdirSync = fs.readdirSync as CreatePluginsOptions['readdirSync'],
    loadModule = (modulePath: string) => require(modulePath) as PluginModule,
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

export { createPlugins, buildRegistry, PluginRegistry };
export type { Plugin };
