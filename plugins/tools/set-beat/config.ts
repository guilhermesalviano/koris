import { definePluginConfig } from '../../config/define-config';

export interface SetBeatPluginConfig {
  enabled: boolean;
}

const setBeatConfig = definePluginConfig<SetBeatPluginConfig>({
  family: 'tools',
  pluginName: 'set-beat',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_SET_BEAT_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadSetBeatConfig = setBeatConfig.load;
export const writeSetBeatConfigPatch = setBeatConfig.writePatch;
