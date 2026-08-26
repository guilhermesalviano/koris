import { definePluginConfig } from '../../config/define-config';

export interface UpdateBeatPluginConfig {
  enabled: boolean;
}

const updateBeatConfig = definePluginConfig<UpdateBeatPluginConfig>({
  family: 'tools',
  pluginName: 'update-beat',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_UPDATE_BEAT_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadUpdateBeatConfig = updateBeatConfig.load;
export const writeUpdateBeatConfigPatch = updateBeatConfig.writePatch;
