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
    private channel: string
  ) { }

  async handle(message: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const safeMessage = toSafeMessage(message);

    this.logger.info(`Processing message from ${this.channel}: "${previewMessage(safeMessage)}"`);

    if (isCommand(safeMessage)) {
      conversationWorker(this.historyHelper(safeMessage, ''))
        .catch((err) =>
          this.logger.error('Background conversation processing failed', { err })
        );

      const result = handleCommand(safeMessage, { source: this.channel });
      return result.response || '';
    }

    const response = await manager(this.logger, safeMessage, this.channel, this.messageService, { ...options });

    if (typeof response !== 'string') {
      return this.persistAssistantStream(response, safeMessage, options);
    }

    conversationWorker(this.historyHelper(safeMessage, response))
      .catch((err) => 
        this.logger.error('Background conversation processing failed', { err })
      );
    summarizerWorker(this.summarizerHelper(safeMessage, response, options))
      .catch((err) =>
        this.logger.error('Background summarizer failed', { err })
      );

    return response;
  }

  private async *persistAssistantStream(
    stream: AsyncGenerator<string>,
    userMessage: string,
    options?: ProcessOptions
  ): AsyncGenerator<string> {
    let fullResponse = '';

    for await (const chunk of stream) {
      fullResponse += chunk;
      yield chunk;
    }

    if (fullResponse.length > 0) {
      conversationWorker(this.historyHelper(userMessage, fullResponse))
        .catch((err) =>
          this.logger.error('Background conversation processing failed', { err })
        );
      summarizerWorker(this.summarizerHelper(userMessage, fullResponse, options))
        .catch((err) =>
          this.logger.error('Background summarizer failed', { err })
        );
    }
  }

  private historyHelper(ask: string, answer: string) {
    return {
      sessionId: this.messageService.getSessionId(),
      ask: ask,
      answer: answer,
      logger: this.logger,
      channel: this.channel,
      messageService: this.messageService,
    };
  }

  private summarizerHelper(ask: string, answer: string, options?: ProcessOptions, type: MemoryType = "summary") {
    return {
      sessionId: this.messageService.getSessionId(),
      ask,
      answer,
      type: type,
      logger: this.logger,
      channel: this.channel,
      memoryService: this.memoryService,
      options,
    };
  }
}

class AgentHandlerFactory {
  static create(logger: ILogger, channel: string): AgentHandler {
    const database = DatabaseServiceFactory.create();

    const sessionService = SessionServiceFactory.create(database, channel);
    const messageService = MessageServiceFactory.create(database, sessionService);
    const memoryService = MemoryServiceFactory.create(database, sessionService.getSession().id);

    return new AgentHandler(logger, messageService, memoryService, channel);
  }
}

export { AgentHandlerFactory, IAgentHandler }