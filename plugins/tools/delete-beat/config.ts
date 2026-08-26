import { definePluginConfig } from '../../config/define-config';

export interface DeleteBeatPluginConfig {
  enabled: boolean;
}

const deleteBeatConfig = definePluginConfig<DeleteBeatPluginConfig>({
  family: 'tools',
  pluginName: 'delete-beat',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_DELETE_BEAT_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadDeleteBeatConfig = deleteBeatConfig.load;
export const writeDeleteBeatConfigPatch = deleteBeatConfig.writePatch;
