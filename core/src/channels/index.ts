import type { ILogger } from '../infrastructure/logger';
import type { IMessageGateway } from '../services/agents/message-gateway';
import type {
  ChannelDefinition,
  ChannelHandlerOptions,
  ChannelReply,
  IChannelHandler,
  IChannelHandlerFactory,
  InboundChannelMessage,
  StickerReference,
} from '../../../plugins/channels/contracts';
import { ADAPTERS } from '../../../plugins/channels/contracts';
import { ChannelHandler, ChannelHandlerFactory } from './handler';
import { resolveResponse, splitMessage } from './utils';

export type {
  ChannelDefinition,
  ChannelHandlerOptions,
  ChannelReply,
  IChannelHandler,
  IChannelHandlerFactory,
  InboundChannelMessage,
};
export { ADAPTERS, ChannelHandler, ChannelHandlerFactory, resolveResponse, splitMessage };

export type StopFn = () => void;

export interface IChannelsManager {
  startAll(): void;
  stopAll(): void;
  sendMessage(channel: string, target: string, message: string): Promise<void>;
  sendSticker(channel: string, target: string, sticker: StickerReference): Promise<void>;
}

class ChannelsManager implements IChannelsManager {
  private logger: ILogger;
  private gateway: IMessageGateway;
  private stopFns: StopFn[] = [];
  private channels: ChannelDefinition[];

  constructor(
    logger: ILogger,
    gateway: IMessageGateway,
    channels: ChannelDefinition[] = [],
  ) {
    this.logger = logger;
    this.gateway = gateway;
    this.channels = channels;
  }

  startAll() {
    for (const channel of this.channels) {
      if (!channel.enabled()) continue;
      this.logger.info(`Starting channel: ${channel.name}`);
      const stop = channel.start(this.logger, this.gateway);
      if (typeof stop === 'function') this.stopFns.push(stop);
    }
  }

  stopAll() {
    this.logger.info("\n👋 Shutting down gracefully...");
    this.stopFns.forEach((stop) => stop());
  }

  async sendMessage(channel: string, target: string, message: string): Promise<void> {
    const definition = this.resolveChannel(channel, 'sendMessage', 'outgoing messages');
    await definition.sendMessage(this.logger, target, message);
  }

  async sendSticker(channel: string, target: string, sticker: StickerReference): Promise<void> {
    const definition = this.resolveChannel(channel, 'sendSticker', 'sending stickers');
    await definition.sendSticker(this.logger, target, sticker);
  }

  private resolveChannel<K extends 'sendMessage' | 'sendSticker'>(
    channel: string,
    capability: K,
    capabilityLabel: string,
  ): ChannelDefinition & Required<Pick<ChannelDefinition, K>> {
    const definition = this.channels.find((current) => current.name === channel);

    if (!definition) {
      throw new Error(`Unknown channel: ${channel}`);
    }

    if (!definition.enabled()) {
      throw new Error(`Channel "${channel}" is not enabled.`);
    }

    if (!definition[capability]) {
      throw new Error(`Channel "${channel}" does not support ${capabilityLabel}.`);
    }

    return definition as ChannelDefinition & Required<Pick<ChannelDefinition, K>>;
  }
}

class ChannelsSingleton {
  private static instance: ChannelsManager;

  static getInstance(logger: ILogger, gateway: IMessageGateway, channels: ChannelDefinition[] = []): ChannelsManager {
    if (!ChannelsSingleton.instance) {
      const seen = new Set<string>();
      const duplicates = channels
        .map((c) => c.name)
        .filter((name) => (seen.has(name) ? true : (seen.add(name), false)));

      if (duplicates.length > 0) {
        throw new Error(
          `Duplicate channel names detected: ${[...new Set(duplicates)].join(', ')}. Each channel must have a unique name.`,
        );
      }

      ChannelsSingleton.instance = new ChannelsManager(logger, gateway, channels);
    }
    return ChannelsSingleton.instance;
  }

  static getExistingInstance(): ChannelsManager | null {
    return ChannelsSingleton.instance;
  }
}

export { ChannelsManager, ChannelsSingleton };
