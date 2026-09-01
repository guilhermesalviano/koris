import * as fs from 'node:fs';
import path from 'node:path';
import { PluginRegistry, buildRegistry, type Plugin } from '../registry';
import type { PluginContext, LiveChannelDescriptor } from './contracts';

type PluginDirectoryEntry = Pick<fs.Dirent, 'name' | 'isDirectory'>;

interface PluginModule {
  create?(context?: PluginContext): Plugin | null;
  liveChannel?: LiveChannelDescriptor;
}

interface CreatePluginsOptions {
  directory?: string;
  readdirSync?: (directory: string, options: { withFileTypes: true }) => PluginDirectoryEntry[];
  loadModule?: (modulePath: string) => PluginModule;
  context?: PluginContext;
}

type ScanOptions = Pick<CreatePluginsOptions, 'directory' | 'readdirSync' | 'loadModule'>;

function scanChannelModules(options: ScanOptions = {}): PluginModule[] {
  const {
    directory = __dirname,
    readdirSync = fs.readdirSync as CreatePluginsOptions['readdirSync'],
    loadModule = (modulePath: string) => require(modulePath) as PluginModule,
  } = options;

  return readdirSync!(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadModule(path.join(directory, entry.name)));
}

function createPlugins(options: CreatePluginsOptions = {}): Plugin[] {
  const { context, ...scan } = options;

  return scanChannelModules(scan).flatMap((mod) => {
    if (typeof mod.create !== 'function') return [];
    const plugin = mod.create(context);
    return plugin ? [plugin] : [];
  });
}

/**
 * Every channel plugin that exports a `liveChannel` descriptor, discovered by
 * scanning `plugins/channels/*` — the same directory walk `createPlugins` does.
 * Lets the dashboard start/reprime channels without importing any by name.
 */
function listLiveChannels(options: ScanOptions = {}): LiveChannelDescriptor[] {
  return scanChannelModules(options).flatMap((mod) => (mod.liveChannel ? [mod.liveChannel] : []));
}

export { createPlugins, listLiveChannels, buildRegistry, PluginRegistry };
export type { Plugin };
