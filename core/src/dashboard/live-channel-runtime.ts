import { config } from '../config';
import { ChannelHandlerFactory } from '../channels';
import type { ILogger } from '../infrastructure/logger';
import type { IMessageGateway } from '../services/agents/message-gateway';
import {
  configureWhatsAppRuntime,
  WhatsAppChannelFactory,
  loadWhatsAppConfig,
  writeWhatsAppConfigPatch,
} from '../../../plugins/channels/whatsapp';
import {
  configureTelegramRuntime,
  TelegramChannelFactory,
  loadTelegramConfig,
  writeTelegramConfigPatch,
} from '../../../plugins/channels/telegram';

type LiveChannelName = 'telegram' | 'whatsapp';

const stopFns = new Map<LiveChannelName, () => void>();
const starting = new Set<LiveChannelName>();

/**
 * Starts (or, if already connecting/connected, no-ops on) the WhatsApp
 * channel outside the normal one-time boot registration in
 * `ChannelsManager`, so the setup wizard can bring it up live after saving
 * its config — without a process restart.
 */
export function startWhatsAppLive(logger: ILogger, gateway: IMessageGateway): void {
  if (stopFns.has('whatsapp') || starting.has('whatsapp')) return;
  starting.add('whatsapp');

  const cfg = configureWhatsAppRuntime({
    channelHandler: ChannelHandlerFactory,
    allowUntrusted: config.CHANNELS.ALLOW_UNTRUSTED,
  });

  WhatsAppChannelFactory.start({
    authFolder: cfg.authFolder,
    mentionId: cfg.mentionId,
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
 * — which is the default on a fresh install with no config.yml.
 */
export function startTelegramLive(logger: ILogger, gateway: IMessageGateway): void {
  if (stopFns.has('telegram') || starting.has('telegram')) return;
  starting.add('telegram');

  const cfg = configureTelegramRuntime({
    channelHandler: ChannelHandlerFactory,
    allowUntrusted: config.CHANNELS.ALLOW_UNTRUSTED,
  });

  TelegramChannelFactory.start({ token: cfg.token, gateway, logger })
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

export { loadTelegramConfig, loadWhatsAppConfig, writeTelegramConfigPatch, writeWhatsAppConfigPatch };
