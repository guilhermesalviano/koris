import { defineChannelConfig, type ChannelConfigModule } from '../channel-config';

export interface WhatsAppPluginConfig {
  authFolder: string;
  whitelist: string;
  /** The bot's own WhatsApp phone number (digits only). Used to detect group mentions. */
  botNumber: string;
  /** When true, senders not on `whitelist` still reach the agent (as untrusted). */
  allowUnlistedSenders: boolean;
}

const whatsAppConfig: ChannelConfigModule<WhatsAppPluginConfig> = defineChannelConfig<WhatsAppPluginConfig>({
  pluginName: 'whatsapp',
  fallbackDir: __dirname,
  schema: {
    authFolder: { yamlKey: 'auth_folder', envKey: 'CHANNELS_WHATSAPP_AUTH_FOLDER', fallback: './.whatsapp_auth' },
    whitelist: { yamlKey: 'whitelist', envKey: 'CHANNELS_WHATSAPP_WHITELIST', fallback: '' },
    botNumber: { yamlKey: 'bot_number', envKey: 'CHANNELS_WHATSAPP_BOT_NUMBER', fallback: '' },
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
