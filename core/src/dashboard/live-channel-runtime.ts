import { ChannelHandlerFactory } from '../channels';
import type { IChannelHandlerFactory } from '../channels';
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

export type LiveChannelName = 'telegram' | 'whatsapp';

/**
 * Adapter over one channel plugin's "start it now, outside the boot-time
 * `ChannelsManager` registration" surface. Needed because a plugin's
 * `create()` may not register a `ChannelDefinition` at all when the channel
 * starts disabled (Telegram's case on a fresh install), so there's nothing
 * for `ChannelsManager` to bring up later.
 *
 * `configureRuntime` re-reads the plugin's `config.yml` into its module-level
 * runtime state (whitelist, `allow_unlisted_senders`) without touching any
 * socket. `start` primes that state and then opens the connection, resolving
 * to the plugin's `stop` fn. The only genuinely per-channel bit is mapping the
 * resolved config onto each vendor factory's own `start(...)` argument shape.
 */
interface LiveChannelAdapter {
  name: LiveChannelName;
  configureRuntime: (opts: { channelHandler: IChannelHandlerFactory }) => unknown;
  start: (gateway: IMessageGateway, logger: ILogger) => Promise<{ stop: () => void }>;
}

const ADAPTERS: LiveChannelAdapter[] = [
  {
    name: 'telegram',
    configureRuntime: configureTelegramRuntime,
    start: (gateway, logger) => {
      const cfg = configureTelegramRuntime({ channelHandler: ChannelHandlerFactory });
      return TelegramChannelFactory.start({ token: cfg.token, gateway, logger });
    },
  },
  {
    name: 'whatsapp',
    configureRuntime: configureWhatsAppRuntime,
    start: (gateway, logger) => {
      const cfg = configureWhatsAppRuntime({ channelHandler: ChannelHandlerFactory });
      return WhatsAppChannelFactory.start({ authFolder: cfg.authFolder, mentionId: cfg.mentionId, gateway, logger });
    },
  },
];

const adapterByName = new Map<LiveChannelName, LiveChannelAdapter>(ADAPTERS.map((a) => [a.name, a]));

const stopFns = new Map<LiveChannelName, () => void>();
const starting = new Set<LiveChannelName>();

/**
 * Starts a channel live (or no-ops if it's already connecting/connected, or
 * not a known live channel), so the setup wizard / admin panel can bring it
 * up after saving its config without a process restart.
 */
export function startChannelLive(name: LiveChannelName, logger: ILogger, gateway: IMessageGateway): void {
  const adapter = adapterByName.get(name);
  if (!adapter || stopFns.has(name) || starting.has(name)) return;
  starting.add(name);

  adapter.start(gateway, logger)
    .then(({ stop }) => {
      stopFns.set(name, stop);
    })
    .catch((err: Error) => {
      logger.warn(`Failed to start ${name} live: ${err.message}`);
    })
    .finally(() => {
      starting.delete(name);
    });
}

export function isChannelLiveStarted(name: LiveChannelName): boolean {
  return stopFns.has(name);
}

/**
 * Re-reads a channel's `config.yml` into its module-level runtime state
 * (whitelist, `allow_unlisted_senders`) without touching its socket, so a
 * channel settings save from the web UI takes effect without a restart.
 * A no-op for an unknown channel; harmless when the channel isn't running —
 * it only refreshes state the message handler reads.
 */
export function reprimeChannelRuntime(name: LiveChannelName): void {
  adapterByName.get(name)?.configureRuntime({ channelHandler: ChannelHandlerFactory });
}

export { loadTelegramConfig, loadWhatsAppConfig, writeTelegramConfigPatch, writeWhatsAppConfigPatch };
