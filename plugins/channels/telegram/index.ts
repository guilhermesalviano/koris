import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';
import type { ILogger, IMessageGateway, LiveChannelDescriptor, Plugin, PluginContext } from '../contracts';
import { createTelegramPlugin } from './adapter';
import { TelegramChannel } from './channel';
import { loadTelegramConfig, writeTelegramConfigPatch, type TelegramPluginConfig } from './config';
import { NOT_AUTHORIZED_MESSAGE } from './constants';
import { TelegramChannelFactory } from './factory';
import { configureTelegramRuntime } from './runtime';
import { _setBotUsernameForTesting, _setTelegramWhitelistForTesting } from './state';
import type { ITelegramChannel } from './types';

const telegramChannel = TelegramChannelFactory.create();

async function handleMessage(gateway: IMessageGateway, msg: TelegramMessage): Promise<void> {
  await telegramChannel.handleMessage(gateway, msg);
}

async function sendCode(chatId: number, code: string, language?: string): Promise<void> {
  await telegramChannel.sendCode(chatId, code, language);
}

async function sendText(chatId: number, text: string): Promise<void> {
  await telegramChannel.sendText(chatId, text);
}

async function sendWithApproval(
  logger: ILogger,
  chatId: number,
  message: string,
  callbackData: string,
): Promise<void> {
  await telegramChannel.sendWithApproval(logger, chatId, message, callbackData);
}

export {
  createTelegramPlugin,
  handleMessage,
  ITelegramChannel,
  loadTelegramConfig,
  sendText,
  sendCode,
  sendWithApproval,
  TelegramChannel,
  TelegramChannelFactory,
  TelegramPluginConfig,
  writeTelegramConfigPatch,
  NOT_AUTHORIZED_MESSAGE,
  configureTelegramRuntime,
  _setBotUsernameForTesting,
  _setTelegramWhitelistForTesting,
};

export const liveChannel: LiveChannelDescriptor = {
  name: 'telegram',
  configureRuntime: ({ channelHandler }) =>
    configureTelegramRuntime({ channelHandler }) as unknown as Record<string, unknown>,
  start: ({ channelHandler, gateway, logger }) => {
    const cfg = configureTelegramRuntime({ channelHandler });
    return TelegramChannelFactory.start({ token: cfg.token, gateway, logger });
  },
  loadConfig: () => loadTelegramConfig() as unknown as Record<string, unknown>,
  writeConfigPatch: (patch) => writeTelegramConfigPatch(patch),
};

export function create(context: PluginContext, configOverride?: TelegramPluginConfig): Plugin {
  const cfg = configOverride ?? loadTelegramConfig();

  if (context.pluginEnablement.isEnabled('telegram') && !cfg.token) {
    // Enabled alone doesn't start the channel — `createTelegramAdapter`'s
    // `enabled()` also requires a non-empty token, so without this warning
    // this misconfiguration fails silently (registered, never started).
    context.logger.warn(
      '[telegram] enabled but bot_token is empty — the channel will not start. ' +
      'Set CHANNELS_TELEGRAM_BOT_TOKEN or bot_token in plugins/channels/telegram/config.yml.',
    );
  }

  configureTelegramRuntime({
    channelHandler: context.channelHandler,
    config: cfg,
  });

  return createTelegramPlugin({
    token: cfg.token,
    isEnabled: () => context.pluginEnablement.isEnabled('telegram'),
  });
}
