import { defineChannelConfig, type ChannelConfigModule } from '../channel-config';

export interface TelegramPluginConfig {
  token: string;
  whitelist: string;
  /** When true, senders not on `whitelist` still reach the agent (as untrusted). */
  allowUnlistedSenders: boolean;
}

const telegramConfig: ChannelConfigModule<TelegramPluginConfig> = defineChannelConfig<TelegramPluginConfig>({
  pluginName: 'telegram',
  fallbackDir: __dirname,
  schema: {
    token: { yamlKey: 'bot_token', envKey: 'CHANNELS_TELEGRAM_BOT_TOKEN', fallback: '' },
    whitelist: { yamlKey: 'whitelist', envKey: 'CHANNELS_TELEGRAM_WHITELIST', fallback: '' },
    allowUnlistedSenders: {
      yamlKey: 'allow_unlisted_senders',
      envKey: 'CHANNELS_TELEGRAM_ALLOW_UNLISTED_SENDERS',
      fallback: 'false',
      parse: (raw) => raw === 'true',
    },
  },
});

export const loadTelegramConfig = telegramConfig.load;
export const writeTelegramConfigPatch = telegramConfig.writePatch;
