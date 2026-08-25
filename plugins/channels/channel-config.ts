import { getPluginConfigValue, loadPluginConfigFile, resolvePluginDir, type PluginConfigFileIO } from './config-loader';
import { writePluginConfigPatch } from './config-writer';

export interface ChannelConfigFieldSpec<TValue> {
  yamlKey: string;
  envKey: string;
  fallback: string;
  parse?: (raw: string) => TValue;
}

export type ChannelConfigSchema<TConfig> = {
  [K in keyof TConfig]: ChannelConfigFieldSpec<TConfig[K]>;
};

export interface LoadChannelConfigOptions {
  pluginDir?: string;
  fileIO?: PluginConfigFileIO;
  env?: NodeJS.ProcessEnv;
  onParseError?: (message: string) => void;
}

export interface WriteChannelConfigOptions {
  pluginDir?: string;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
}

export interface ChannelConfigModule<TConfig> {
  load(options?: LoadChannelConfigOptions): TConfig;
  writePatch(patch: Record<string, unknown>, options?: WriteChannelConfigOptions): string;
}

export interface ChannelConfigDefinition<TConfig> {
  pluginName: string;
  /** __dirname of the calling channel's config.ts — used as a resolution fallback. */
  fallbackDir: string;
  schema: ChannelConfigSchema<TConfig>;
}

export function defineChannelConfig<TConfig>(
  definition: ChannelConfigDefinition<TConfig>,
): ChannelConfigModule<TConfig> {
  const { pluginName, fallbackDir, schema } = definition;

  return {
    load(options = {}) {
      const pluginDir = options.pluginDir ?? resolvePluginDir(pluginName, { fallbackDir });
      const yamlConfig = loadPluginConfigFile({
        pluginDir,
        fileIO: options.fileIO,
        onParseError: options.onParseError,
      });
      const env = options.env ?? process.env;

      const result = {} as TConfig;
      for (const key of Object.keys(schema) as Array<keyof TConfig>) {
        const spec = schema[key];
        const raw = getPluginConfigValue(spec.yamlKey, spec.fallback, yamlConfig, spec.envKey, env);
        result[key] = (spec.parse ? spec.parse(raw) : (raw as unknown)) as TConfig[typeof key];
      }
      return result;
    },

    writePatch(patch, options = {}) {
      const pluginDir = options.pluginDir ?? resolvePluginDir(pluginName, { fallbackDir, exists: options.exists });
      return writePluginConfigPatch(patch, { ...options, pluginDir });
    },
  };
}
