import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { SessionServiceFactory } from '../session-service';
import { IMessageService, MessageServiceFactory } from '../message-service';
import { toolsLoop } from './tools-loop/manager';
import { summarizerWorker } from './summarizer';
import { IMemoryService, MemoryServiceFactory } from '../memory-service';

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
    this.messageService.save({ role: 'user', content: safeMessage });

    if (isCommand(safeMessage)) {
      const result = handleCommand(safeMessage, { source: this.channel });
      return result.response || '';
    }

    const response = await toolsLoop(this.logger, safeMessage, this.channel, this.messageService, { ...options });

    if (typeof response !== 'string') {
      return this.persistAssistantStream(response, safeMessage, options);
    }
    this.messageService.save({ role: 'assistant', content: response });

    summarizerWorker(
      this.messageService.getSessionId(),
      safeMessage,
      response,
      "summary",
      this.logger,
      this.channel,
      this.memoryService,
      options
    ).catch((err) => this.logger.error('Background summarizer failed', { err }));

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
      this.messageService.save({ role: 'assistant', content: fullResponse });

      summarizerWorker(
        this.messageService.getSessionId(),
        userMessage,
        fullResponse,
        "summary",
        this.logger,
        this.channel,
        this.memoryService,
        options
      ).catch((err) => this.logger.error('Background summarizer failed', { err }));
    }
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