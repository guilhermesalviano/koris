import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { AIiteration } from './ralph/ai-iteration';
import { SessionServiceFactory } from '../session';
import { MessageServiceFactory } from '../message';

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 * Stores all interactions in the database for audit and analytics.
 */
async function handle(
  logger: ILogger,
  message: unknown,
  channel: string,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  const database = DatabaseServiceFactory.create();
  const sessionService = SessionServiceFactory.create(database, channel);
  const messageService = MessageServiceFactory.create(database, sessionService);

  logger.info(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    
    // Store command in database
    try {
      messageService.save({ role: 'user', content: safeMessage });
      messageService.save({ role: 'assistant', content: result.response || '' });
    } catch (error) {
      logger.error('Failed to store command messages', { error });
    }
    
    return result.response || '';
  }

  // Process AI messages with potential multi-round tool execution
  return await AIiteration(logger, safeMessage, channel, messageService, { ...options });
}


export { handle };