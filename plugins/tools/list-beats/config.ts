import { definePluginConfig } from '../../config/define-config';

export interface ListBeatsPluginConfig {
  enabled: boolean;
}

const listBeatsConfig = definePluginConfig<ListBeatsPluginConfig>({
  family: 'tools',
  pluginName: 'list-beats',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_LIST_BEATS_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadListBeatsConfig = listBeatsConfig.load;
export const writeListBeatsConfigPatch = listBeatsConfig.writePatch;
