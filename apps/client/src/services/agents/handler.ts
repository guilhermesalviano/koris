import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { SessionServiceFactory } from '../session-service';
import { IMessageService, MessageServiceFactory } from '../message-service';
import { manager } from './tools-loop/manager';
import { summarizerWorker } from './summarizer';
import { IMemoryService, MemoryServiceFactory } from '../memory-service';
import { conversationWorker } from './conversation';
import { MemoryType } from '../../types/memory';

interface IAgentHandler {
  handle(message: unknown, options?: ProcessOptions): Promise<ProcessedMessage>;
}

class AgentHandler {
  constructor(
    private logger: ILogger,
    private messageService: IMessageService,
    private memoryService: IMemoryService,
    private channel: string,
    private sessionId: string,
  ) { }

  async handle(message: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const safeMessage = toSafeMessage(message);

    this.logger.info(`Processing message from ${this.channel}: "${previewMessage(safeMessage)}"`);

    if (isCommand(safeMessage)) {
      const response = handleCommand(safeMessage, { source: this.channel }).response || '';
      this.historyHelper(safeMessage, response);
      return response;
    }

    const response = await manager(this.logger, safeMessage, this.channel, this.messageService, { ...options });

    if (typeof response !== 'string') {
      return this.persistAssistantStream(response, safeMessage);
    }

    this.historyHelper(safeMessage, response);
    this.summarizerHelper(safeMessage, response);

    return response;
  }

  private async *persistAssistantStream(
    stream: AsyncGenerator<string>,
    ask: string,
  ): AsyncGenerator<string> {
    let fullResponse = '';

    for await (const chunk of stream) {
      fullResponse += chunk;
      yield chunk;
    }

    if (fullResponse.length > 0) {
      this.historyHelper(ask, fullResponse);
      this.summarizerHelper(ask, fullResponse);
    }
  }

  private historyHelper(ask: string, answer: string) {
    const conversation = {
      sessionId: this.sessionId,
      ask,
      answer,
      logger: this.logger,
      channel: this.channel,
      messageService: this.messageService,
    };

    conversationWorker(conversation)
      .catch((err) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  private summarizerHelper(ask: string, answer: string, type: MemoryType = "summary") {
    const conversation = {
      sessionId: this.sessionId,
      ask,
      answer,
      type,
      logger: this.logger,
      channel: this.channel,
      memoryService: this.memoryService,
    };

    summarizerWorker(conversation)
      .catch((err) =>
        this.logger.error('Background summarizer failed', { err })
      );
  }
}

class AgentHandlerFactory {
  static create(logger: ILogger, channel: string): AgentHandler {
    const database = DatabaseServiceFactory.create();
    
    const sessionService = SessionServiceFactory.create(database, channel);
    const sessionId = sessionService.getSession().id;

    const messageService = MessageServiceFactory.create(database, sessionService);
    const memoryService = MemoryServiceFactory.create(database, sessionId);

    return new AgentHandler(logger, messageService, memoryService, channel, sessionId);
  }
}

export { AgentHandlerFactory, IAgentHandler }