import { ADAPTERS } from '../contracts';
import type { ChannelDefinition, ILogger, IMessageGateway, Plugin } from '../contracts';
import type { PluginRegistry } from '../../registry';
import { TELEGRAM_CAPABILITIES } from './constants';
import { TelegramChannelFactory } from './factory';
import type { TelegramPluginOptions } from './types';

export function createTelegramAdapter(options: TelegramPluginOptions): ChannelDefinition {
  return {
    name: 'telegram',
    enabled: () => options.isEnabled() && options.token.length > 0,
    capabilities: TELEGRAM_CAPABILITIES,
    start: (logger: ILogger, gateway: IMessageGateway) => {
      let stopFn: (() => void) | null = null;

      TelegramChannelFactory.start({ token: options.token, gateway, logger })
        .then(({ stop }) => { stopFn = stop; })
        .catch((err: Error) => logger.warn(`Failed to start Telegram bot: ${err.message}`));

      return () => { stopFn?.(); };
    },
    sendMessage: async (_logger: ILogger, target: string, message: string) => {
      const chatId = Number(target);

      if (!Number.isFinite(chatId)) {
        throw new Error(`Invalid Telegram chat ID: ${target}`);
      }

      await TelegramChannelFactory.sendText(chatId, message);
    },
  };
}

export function createTelegramPlugin(options: TelegramPluginOptions): Plugin {
  return {
    name: 'telegram',
    setup(registry: PluginRegistry) {
      registry.extend(ADAPTERS, createTelegramAdapter(options));
    },
  };
}
