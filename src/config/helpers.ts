import { existsSync, readFileSync } from 'fs';
import { join, normalize } from 'path';

export interface ConfigFileIO {
  exists(path: string): boolean;
  read(path: string): string;
}

const defaultFileIO: ConfigFileIO = {
  exists: existsSync,
  read: (path: string) => readFileSync(path, 'utf-8'),
};

export function resolveConfigPaths(cwd: string = process.cwd(), dirname: string = __dirname): string[] {
  return Array.from(new Set([
    join(cwd, 'settings.json'),
    join(cwd, 'apps', 'client', 'settings.json'),
    join(dirname, '..', '..', 'settings.json'),
    join(dirname, '..', '..', '..', 'settings.json'),
  ].map((path) => normalize(path))));
}

export function loadConfigFile(options?: {
  cwd?: string;
  dirname?: string;
  fileIO?: ConfigFileIO;
  onParseError?: (message: string) => void;
}): Record<string, unknown> {
  const cwd = options?.cwd ?? process.cwd();
  const dirname = options?.dirname ?? __dirname;
  const fileIO = options?.fileIO ?? defaultFileIO;

  const configPath = resolveConfigPaths(cwd, dirname).find((candidate) => fileIO.exists(candidate));
  if (!configPath) {
    return {};
  }

  try {
    return JSON.parse(fileIO.read(configPath)) as Record<string, unknown>;
  } catch {
    options?.onParseError?.('Warning: Failed to parse settings.json, ignoring file.');
    return {};
  }
}

export function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }

    return undefined;
  }, obj);
}

export function toEnvKey(path: string): string {
  return path.replace(/\./g, '_').toUpperCase();
}

export function getConfigValue(
  path: string,
  fallback: string,
  fileConfig: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envKey = toEnvKey(path);
  if (Object.prototype.hasOwnProperty.call(env, envKey)) {
    return String(env[envKey] ?? '');
  }

  const fileValue = deepGet(fileConfig, path);
  if (fileValue === undefined || fileValue === null) {
    return fallback;
  }

  return String(fileValue);
}
