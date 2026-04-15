import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { Session } from '../../entities/session';
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
  sessionId: string,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  const database = DatabaseServiceFactory.create();
  const sessionService = SessionServiceFactory.create(database);
  const messageService = MessageServiceFactory.create(database);

  logger.info(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`, { sessionId });

  // Initialize session in database
  try {
    const session = new Session({
      id: sessionId,
      source: channel,
      messageCount: 0,
      metadata: { initiated: new Date().toISOString() },
    });
    sessionService.save(session);
    logger.debug(`Session created: ${sessionId}`);
  } catch (error) {
    logger.error('Failed to create session', { error, sessionId });
  }

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    
    // Store command in database
    try {
      messageService.save({ sessionId: sessionId, role: 'user', content: safeMessage });
      messageService.save({ sessionId: sessionId, role: 'assistant', content: result.response || '' });
      sessionService.updateCount({
        id: sessionId,
      });
    } catch (error) {
      logger.error('Failed to store command messages', { error, sessionId });
    }
    
    return result.response || '';
  }

  // Process AI messages with potential multi-round tool execution
  return await AIiteration(logger, safeMessage, channel, sessionId, sessionService, messageService, { ...options });
}


export { handle };