import { definePluginConfig } from '../../config/define-config';

export interface CreateToolPluginConfig {
  enabled: boolean;
}

const createToolConfig = definePluginConfig<CreateToolPluginConfig>({
  family: 'tools',
  pluginName: 'create-tool',
  fallbackDir: __dirname,
  schema: {
    // Defaults OFF, unlike the other 11 tools — scaffolding new executable
    // code from chat is meaningfully higher-stakes than the rest and should
    // be an opt-in enabled by whoever runs the server, not on by default.
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_CREATE_TOOL_ENABLED', fallback: 'false', parse: (v) => v === 'true' },
  },
});

export const loadCreateToolConfig = createToolConfig.load;
export const writeCreateToolConfigPatch = createToolConfig.writePatch;
