import { config } from '../config';
import { ChannelHandlerFactory } from '../channels';
import type { ILogger } from '../infrastructure/logger';
import type { IMessageGateway } from '../services/agents/message-gateway';
import { configureWhatsAppRuntime, WhatsAppChannelFactory } from '../../plugins/whatsapp';
import { configureTelegramRuntime, TelegramChannelFactory } from '../../plugins/telegram';

type LiveChannelName = 'telegram' | 'whatsapp';

const stopFns = new Map<LiveChannelName, () => void>();
const starting = new Set<LiveChannelName>();

/**
 * Starts (or, if already connecting/connected, no-ops on) the WhatsApp
 * channel outside the normal one-time boot registration in
 * `ChannelsManager`, so the setup wizard can bring it up live after saving
 * koris.json — without a process restart.
 */
export function startWhatsAppLive(logger: ILogger, gateway: IMessageGateway): void {
  if (stopFns.has('whatsapp') || starting.has('whatsapp')) return;
  starting.add('whatsapp');

  configureWhatsAppRuntime({
    channelHandler: ChannelHandlerFactory,
    mentionId: config.CHANNELS.WHATSAPP.MENTION_ID,
    whitelist: config.CHANNELS.WHATSAPP.WHITELIST,
    allowUntrusted: config.CHANNELS.ALLOW_UNTRUSTED,
  });

  WhatsAppChannelFactory.start({
    authFolder: config.CHANNELS.WHATSAPP.AUTH_FOLDER,
    mentionId: config.CHANNELS.WHATSAPP.MENTION_ID,
    gateway,
    logger,
  })
    .then(({ stop }) => {
      stopFns.set('whatsapp', stop);
    })
    .catch((err: Error) => {
      logger.warn(`Failed to start WhatsApp live: ${err.message}`);
    })
    .finally(() => {
      starting.delete('whatsapp');
    });
}

/**
 * Starts (or no-ops on) the Telegram channel live, mirroring
 * `startWhatsAppLive`. Needed because `plugins/telegram`'s `create()`
 * doesn't even register a channel definition when Telegram starts disabled
 * — which is the default on a fresh install with no koris.json.
 */
export function startTelegramLive(logger: ILogger, gateway: IMessageGateway, token: string): void {
  if (stopFns.has('telegram') || starting.has('telegram')) return;
  starting.add('telegram');

  configureTelegramRuntime({
    channelHandler: ChannelHandlerFactory,
    token,
    whitelist: config.CHANNELS.TELEGRAM.WHITELIST,
    allowUntrusted: config.CHANNELS.ALLOW_UNTRUSTED,
  });

  TelegramChannelFactory.start({ token, gateway, logger })
    .then(({ stop }) => {
      stopFns.set('telegram', stop);
    })
    .catch((err: Error) => {
      logger.warn(`Failed to start Telegram live: ${err.message}`);
    })
    .finally(() => {
      starting.delete('telegram');
    });
}

export function isChannelLiveStarted(name: LiveChannelName): boolean {
  return stopFns.has(name);
}
