import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { AIiteration } from './ralph/ai-iteration';
import { SessionServiceFactory } from '../session-service';
import { IMessageService, MessageServiceFactory } from '../message-service';

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

    // Handle commands using centralized handler
    if (isCommand(safeMessage)) {
      const result = handleCommand(safeMessage, { source: this.channel });
      
      // Store command in database
      try {
        this.messageService.save({ role: 'user', content: safeMessage });
        this.messageService.save({ role: 'assistant', content: result.response || '' });
      } catch (error) {
        this.logger.error('Failed to store command messages', { error });
      }
      
      return result.response || '';
    }

    // Process AI messages with potential multi-round tool execution
    return await AIiteration(this.logger, safeMessage, this.channel, this.messageService, { ...options });
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