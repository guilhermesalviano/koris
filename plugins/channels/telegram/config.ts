import { defineChannelConfig, type ChannelConfigModule } from '../channel-config';

export interface TelegramPluginConfig {
  token: string;
  whitelist: string;
}

const telegramConfig: ChannelConfigModule<TelegramPluginConfig> = defineChannelConfig<TelegramPluginConfig>({
  pluginName: 'telegram',
  fallbackDir: __dirname,
  schema: {
    token: { yamlKey: 'bot_token', envKey: 'CHANNELS_TELEGRAM_BOT_TOKEN', fallback: '' },
    whitelist: { yamlKey: 'whitelist', envKey: 'CHANNELS_TELEGRAM_WHITELIST', fallback: '' },
  },
});

export const loadTelegramConfig = telegramConfig.load;
export const writeTelegramConfigPatch = telegramConfig.writePatch;
