import { definePluginConfig } from '../../config/define-config';

export interface LearnStickerPluginConfig {
  enabled: boolean;
}

const learnStickerConfig = definePluginConfig<LearnStickerPluginConfig>({
  family: 'tools',
  pluginName: 'learn-sticker',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_LEARN_STICKER_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadLearnStickerConfig = learnStickerConfig.load;
export const writeLearnStickerConfigPatch = learnStickerConfig.writePatch;
