import { handleCommand, isCommand } from '../commands';
import { previewMessage, toSafeMessage } from '../../utils/message';
import { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ISessionManager } from '../session-manager';
import { IMainAgent, MainAgentFactory } from './main-agent';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { ImageAttachment } from '../../types/messages';
import { generateId } from '../../utils/generate-id';
import { ISessionContextFactory, SessionContextFactory } from './session-context';
import { IBackgroundDispatcher, BackgroundDispatcherFactory } from './background-dispatcher';
import { IChannelService, ChannelServiceFactory } from '../channel-service';
import type { InboundInput, IMessageGateway, StickerReference } from '../../../plugins/contracts';

export type { InboundInput, IMessageGateway };

function normalizeInput(input: InboundInput): { text: string; images?: ImageAttachment[]; stickers?: StickerReference[] } {
  if (typeof input === 'string') {
    return { text: input };
  }
  if (input == null || typeof input !== 'object') {
    return { text: '' };
  }
  return { text: input.text, images: input.images, stickers: input.stickers };
}

class MessageGateway implements IMessageGateway {
  constructor(
    private logger: ILogger,
    private channel: string,
    private sessionContextFactory: ISessionContextFactory,
    private backgroundDispatcher: IBackgroundDispatcher,
    private mainAgent: IMainAgent,
    private channelService: IChannelService,
  ) {}

  async handle(input: InboundInput, originId: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const { text, images, stickers } = normalizeInput(input);
    const safeMessage = toSafeMessage(text);
    const channel = options?.channel ?? this.channel;

    this.logger.info(`Processing message from ${channel} (origin: ${originId}): "${previewMessage(safeMessage)}"${images?.length ? ` with ${images.length} image(s)` : ''}`);

    const { sessionService, messageService, memoryService } = this.sessionContextFactory.resolve(originId, options?.sessionId);

    this.channelService.record(channel, originId);

    if (isCommand(safeMessage)) {
      const response = handleCommand(safeMessage, { source: channel }).response || '';
      this.backgroundDispatcher.persistConversation({
        sessionId: sessionService.getSession().id,
        ask: safeMessage,
        askImages: images,
        answer: response,
        channel,
      });
      return response;
    }

    const response = await this.mainAgent.run({
      userMessage: safeMessage,
      channel,
      message: messageService,
      images,
      stickers,
      target: originId,
      options: { ...options, runId: options?.runId ?? generateId() },
    });

    this.logger.info(`Processed message from ${channel}: "${previewMessage(safeMessage)}" => "${previewMessage(response)}"`);

    const sessionId = messageService.getSessionId();
    this.backgroundDispatcher.persistConversation({ sessionId, ask: safeMessage, askImages: images, answer: response, channel });
    this.backgroundDispatcher.summarizeConversation({
      sessionId,
      ask: safeMessage,
      answer: response,
      channel,
      memoryService,
    });

    return response;
  }
}

class MessageGatewayFactory {
  static create(logger: ILogger, channel: string, db: IDatabaseService, sessionManager: ISessionManager): MessageGateway {
    const sessionContextFactory = SessionContextFactory.create(logger, db, sessionManager);
    const backgroundDispatcher = BackgroundDispatcherFactory.create(logger, db, sessionManager);
    const mainAgent = MainAgentFactory.create(logger);
    const channelService = ChannelServiceFactory.create(db);

    return new MessageGateway(logger, channel, sessionContextFactory, backgroundDispatcher, mainAgent, channelService);
  }
}

export { MessageGateway, MessageGatewayFactory }
