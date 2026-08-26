import { definePluginConfig } from '../../config/define-config';

export interface UnlearnStickerPluginConfig {
  enabled: boolean;
}

const unlearnStickerConfig = definePluginConfig<UnlearnStickerPluginConfig>({
  family: 'tools',
  pluginName: 'unlearn-sticker',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_UNLEARN_STICKER_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadUnlearnStickerConfig = unlearnStickerConfig.load;
export const writeUnlearnStickerConfigPatch = unlearnStickerConfig.writePatch;
