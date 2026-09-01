import { defineChannelConfig, type ChannelConfigModule } from '../channel-config';

export interface WhatsAppPluginConfig {
  authFolder: string;
  whitelist: string;
  mentionId: string;
  /** When true, senders not on `whitelist` still reach the agent (as untrusted). */
  allowUnlistedSenders: boolean;
}

const whatsAppConfig: ChannelConfigModule<WhatsAppPluginConfig> = defineChannelConfig<WhatsAppPluginConfig>({
  pluginName: 'whatsapp',
  fallbackDir: __dirname,
  schema: {
    authFolder: { yamlKey: 'auth_folder', envKey: 'CHANNELS_WHATSAPP_AUTH_FOLDER', fallback: './.whatsapp_auth' },
    whitelist: { yamlKey: 'whitelist', envKey: 'CHANNELS_WHATSAPP_WHITELIST', fallback: '' },
    mentionId: { yamlKey: 'mention_id', envKey: 'CHANNELS_WHATSAPP_MENTION_ID', fallback: '' },
    allowUnlistedSenders: {
      yamlKey: 'allow_unlisted_senders',
      envKey: 'CHANNELS_WHATSAPP_ALLOW_UNLISTED_SENDERS',
      fallback: 'false',
      parse: (raw) => raw === 'true',
    },
  },
});

export const loadWhatsAppConfig = whatsAppConfig.load;
export const writeWhatsAppConfigPatch = whatsAppConfig.writePatch;
