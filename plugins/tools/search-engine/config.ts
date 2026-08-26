import { definePluginConfig } from '../../config/define-config';

export interface SearchEnginePluginConfig {
  enabled: boolean;
}

const searchEngineConfig = definePluginConfig<SearchEnginePluginConfig>({
  family: 'tools',
  pluginName: 'search-engine',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_SEARCH_ENGINE_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadSearchEngineConfig = searchEngineConfig.load;
export const writeSearchEngineConfigPatch = searchEngineConfig.writePatch;
