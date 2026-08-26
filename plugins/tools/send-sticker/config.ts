import { definePluginConfig } from '../../config/define-config';

export interface SendStickerPluginConfig {
  enabled: boolean;
}

const sendStickerConfig = definePluginConfig<SendStickerPluginConfig>({
  family: 'tools',
  pluginName: 'send-sticker',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'TOOLS_SEND_STICKER_ENABLED', fallback: 'true', parse: (v) => v === 'true' },
  },
});

export const loadSendStickerConfig = sendStickerConfig.load;
export const writeSendStickerConfigPatch = sendStickerConfig.writePatch;
