import { defineChannelConfig, type ChannelConfigModule } from '../channel-config';

export interface WhatsAppPluginConfig {
  enabled: boolean;
  authFolder: string;
  whitelist: string;
  mentionId: string;
}

const whatsAppConfig: ChannelConfigModule<WhatsAppPluginConfig> = defineChannelConfig<WhatsAppPluginConfig>({
  pluginName: 'whatsapp',
  fallbackDir: __dirname,
  schema: {
    enabled: { yamlKey: 'enabled', envKey: 'CHANNELS_WHATSAPP_ENABLED', fallback: 'false', parse: (v) => v === 'true' },
    authFolder: { yamlKey: 'auth_folder', envKey: 'CHANNELS_WHATSAPP_AUTH_FOLDER', fallback: './.whatsapp_auth' },
    whitelist: { yamlKey: 'whitelist', envKey: 'CHANNELS_WHATSAPP_WHITELIST', fallback: '' },
    mentionId: { yamlKey: 'mention_id', envKey: 'CHANNELS_WHATSAPP_MENTION_ID', fallback: '' },
  },
});

export const loadWhatsAppConfig = whatsAppConfig.load;
export const writeWhatsAppConfigPatch = whatsAppConfig.writePatch;
