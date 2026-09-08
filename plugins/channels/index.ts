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

function resolveDefaultChannelsDir(): string {
  const localDir = path.join(process.cwd(), 'plugins', 'channels');
  if (fs.existsSync(localDir)) {
    return localDir;
  }
  return __dirname;
}

function scanChannelModules(options: ScanOptions = {}): PluginModule[] {
  const {
    directory = resolveDefaultChannelsDir(),
    readdirSync = fs.readdirSync as CreatePluginsOptions['readdirSync'],
    loadModule = (modulePath: string) => require(modulePath) as PluginModule,
  } = options;

  if (!fs.existsSync(directory)) return [];

  return readdirSync!(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [loadModule(path.join(directory, entry.name))];
      } catch {
        return [];
      }
    });
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

export const CHANNELS_DIR = __dirname;
export { createPlugins, listLiveChannels, buildRegistry, PluginRegistry };
export type { Plugin };
