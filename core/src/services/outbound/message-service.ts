import type { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { IChannelsManager } from '../../channels';
import { OutboundMessage } from '../../entities/outbound-message';
import { ChannelType, CHANNEL_TYPES } from '../../entities/channel';
import { IOutboundMessageRepository, OutboundMessageRepositoryFactory } from '../../repositories/outbound-message';
import { ISessionManager } from '../session-manager';
import { MessageServiceFactory } from '../message-service';
import { SessionKind } from '../../types/session';

export interface SendOutboundInput {
  content: string;
  channel: string;
  target: string;
  kind?: SessionKind;
}

interface DeliveryTarget {
  channel: ChannelType;
  target: string;
}

interface IOutboundMessageService {
  send(input: SendOutboundInput): Promise<OutboundMessage>;
}

function isValidChannel(channel: string): channel is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(channel);
}

class OutboundMessageService implements IOutboundMessageService {
  constructor(
    private logger: ILogger,
    private db: IDatabaseService,
    private channelsManager: IChannelsManager,
    private outboundMessageRepository: IOutboundMessageRepository,
    private sessionManager: ISessionManager,
  ) {}

  async send(input: SendOutboundInput): Promise<OutboundMessage> {
    const delivery = this.resolveDelivery(input);

    const message = new OutboundMessage({
      channel: delivery.channel,
      target: delivery.target,
      content: input.content,
      status: 'sent',
    });
    this.outboundMessageRepository.save(message);

    // Record what koris said in the target's own transcript so the session
    // isn't half-deaf from turn two: without this, the session holds the
    // contact's replies but never what was sent to them.
    try {
      const sessionService = this.sessionManager.getSessionService({
        channel: delivery.channel,
        peerId: delivery.target,
        kind: input.kind ?? 'user',
      });
      MessageServiceFactory.create(this.db, sessionService).save({ role: 'assistant', content: input.content });
    } catch (err) {
      this.logger.warn('Failed to record outbound message in session transcript', {
        channel: delivery.channel,
        target: delivery.target,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await this.channelsManager.sendMessage(delivery.channel, delivery.target, input.content);
      this.outboundMessageRepository.markSent(message.id);
      this.logger.info('Outbound message sent', { id: message.id, channel: delivery.channel, target: delivery.target });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.outboundMessageRepository.markFailed(message.id, errorMessage);
      this.logger.error('Outbound message failed', { id: message.id, error: errorMessage });
    }

    return this.outboundMessageRepository.getById(message.id) ?? message;
  }

  private resolveDelivery(input: SendOutboundInput): DeliveryTarget {
    if (!isValidChannel(input.channel)) {
      throw new Error(`Invalid channel: ${input.channel}. Must be one of: ${CHANNEL_TYPES.join(', ')}.`);
    }

    return { channel: input.channel, target: input.target };
  }
}

class OutboundMessageServiceFactory {
  public static create(
    logger: ILogger,
    channelsManager: IChannelsManager,
    db: IDatabaseService,
    sessionManager: ISessionManager,
  ): OutboundMessageService {
    return new OutboundMessageService(
      logger,
      db,
      channelsManager,
      OutboundMessageRepositoryFactory.create(db),
      sessionManager,
    );
  }
}

export { IOutboundMessageService, OutboundMessageService, OutboundMessageServiceFactory };
