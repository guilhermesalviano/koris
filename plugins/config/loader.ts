import { existsSync, readFileSync } from 'fs';
import { join, normalize } from 'path';
import { parse } from 'yaml';

export interface PluginConfigFileIO {
  exists(path: string): boolean;
  read(path: string): string;
}

const defaultFileIO: PluginConfigFileIO = {
  exists: existsSync,
  read: (path: string) => readFileSync(path, 'utf-8'),
};

export interface LoadPluginConfigFileOptions {
  pluginDir: string;
  filename?: string;
  fileIO?: PluginConfigFileIO;
  onParseError?: (message: string) => void;
}

/**
 * Reads and parses a plugin's own `config.yml` (or `{filename}`), returning
 * `{}` when the file is missing or fails to parse — each plugin layers its
 * own defaults on top via `getPluginConfigValue`.
 */
export function loadPluginConfigFile(options: LoadPluginConfigFileOptions): Record<string, unknown> {
  const { pluginDir, filename = 'config.yml' } = options;
  const fileIO = options.fileIO ?? defaultFileIO;
  const path = normalize(join(pluginDir, filename));

  if (!fileIO.exists(path)) {
    return {};
  }

  try {
    const parsed: unknown = parse(fileIO.read(path));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    options.onParseError?.(`Warning: Failed to parse ${filename}, ignoring file.`);
    return {};
  }
}

export type PluginFamily = 'channels' | 'tools';

export interface ResolvePluginDirOptions {
  cwd?: string;
  /** Falls back here (e.g. the calling module's own `__dirname`) when no cwd-relative candidate has the file — correct when running .ts sources directly in dev. */
  fallbackDir?: string;
  exists?: (path: string) => boolean;
  filename?: string;
  /** Which `plugins/<family>/` tree this plugin lives under. Defaults to `'channels'` for source compatibility with pre-existing callers. */
  family?: PluginFamily;
}

/**
 * Locates a plugin's own directory so its `config.yml` can be found at
 * runtime even from a compiled `dist/` build — `tsc` only compiles `.ts`
 * files, so `config.yml` never gets copied next to the compiled `.js`, and
 * `__dirname` alone (pointing at `dist/plugins/<family>/<name>`) would never
 * find it. Prefers `cwd`-relative candidates, which resolve correctly when
 * the app is run from the repo root (the normal case, mirroring how
 * `src/config/helpers.ts`'s `resolveConfigPaths` finds `koris.json`).
 */
export function resolvePluginDir(pluginName: string, options: ResolvePluginDirOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const filename = options.filename ?? 'config.yml';
  const family = options.family ?? 'channels';

  const cwdCandidates = [
    join(cwd, 'plugins', family, pluginName),
    join(cwd, 'apps', 'client', 'plugins', family, pluginName),
  ].map((candidate) => normalize(candidate));

  const found = cwdCandidates.find((candidate) => exists(join(candidate, filename)));
  if (found) {
    return found;
  }

  return options.fallbackDir ? normalize(options.fallbackDir) : cwdCandidates[0];
}

/**
 * Resolves one config value with the same `env > file > fallback`
 * precedence as `src/config/helpers.ts`'s `getConfigValue`.
 */
export function getPluginConfigValue(
  yamlKey: string,
  fallback: string,
  yamlConfig: Record<string, unknown>,
  envKey: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (Object.prototype.hasOwnProperty.call(env, envKey)) {
    return String(env[envKey] ?? '');
  }

  const value = yamlConfig[yamlKey];
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}
