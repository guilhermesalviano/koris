import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { SessionServiceFactory } from '../session-service';
import { IMessageService, MessageServiceFactory } from '../message-service';
import { toolsLoop } from './tools-loop/manager';

interface IAgentHandler {
  handle(message: unknown, options?: ProcessOptions): Promise<ProcessedMessage>;
}

class AgentHandler {
  constructor(
    private logger: ILogger,
    private messageService: IMessageService,
    private channel: string
  ) { }

  async handle(message: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const safeMessage = toSafeMessage(message);

    this.logger.info(`Processing message from ${this.channel}: "${previewMessage(safeMessage)}"`);
    this.messageService.save({ role: 'user', content: safeMessage });

    // Handle commands using centralized handler
    if (isCommand(safeMessage)) {
      const result = handleCommand(safeMessage, { source: this.channel });
      return result.response || '';
    }

    // Process AI messages with potential multi-round tool execution
    const response = await toolsLoop(this.logger, safeMessage, this.channel, this.messageService, { ...options });

    // Streaming response: persist assistant text after stream completes.
    if (typeof response !== 'string') {
      return this.persistAssistantStream(response);
    }
    this.messageService.save({ role: 'assistant', content: response });

    return response;
  }

  private async *persistAssistantStream(stream: AsyncGenerator<string>): AsyncGenerator<string> {
    let fullResponse = '';

    for await (const chunk of stream) {
      fullResponse += chunk;
      yield chunk;
    }

    if (fullResponse.length > 0) {
      this.messageService.save({ role: 'assistant', content: fullResponse });
    }
  }
}

class AgentHandlerFactory {
  static create(logger: ILogger, channel: string): AgentHandler {
    const database = DatabaseServiceFactory.create();

    const sessionService = SessionServiceFactory.create(database, channel);
    const messageService = MessageServiceFactory.create(database, sessionService);

    return new AgentHandler(logger, messageService, channel);
  }
}

export { AgentHandlerFactory, IAgentHandler }