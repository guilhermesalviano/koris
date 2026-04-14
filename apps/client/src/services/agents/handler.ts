import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { randomUUID } from 'node:crypto';
import { SessionRepository } from '../../repositories/session';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { Session } from '../../entities/session';
import { Message } from '../../entities/message';
import { MessageRepository } from '../../repositories/message';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { AIiteration } from './ralph/ai-iteration';

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
  const sessionId = options?.sessionId || randomUUID();

  const db = DatabaseServiceFactory.create();
  const sessionRepo = new SessionRepository(db);
  const messageRepo = new MessageRepository(db);

  logger.info(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`, { sessionId });

  // Initialize session in database
  if (!options?.sessionId) {
    try {
      const session = new Session({
        id: sessionId,
        source: channel,
        startedAt: Date.now(),
        endedAt: 0,
        messageCount: 0,
        metadata: { initiated: new Date().toISOString() },
      });
      sessionRepo.save(session);
      logger.debug(`Session created: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to create session', { error, sessionId });
    }
  }

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    
    // Store command in database
    try {
      const message = new Message({ id: randomUUID(), sessionId, role: 'user', content: safeMessage, created_at: new Date().toISOString(), tool_calls: [], tool_results: [] });
      messageRepo.save(message);

      const assistantMessage = new Message({ id: randomUUID(), sessionId, role: 'assistant', content: result.response || '', created_at: new Date().toISOString(), tool_calls: [], tool_results: [] });
      messageRepo.save(assistantMessage);

      sessionRepo.save(new Session({
        id: sessionId,
        source: channel,
        startedAt: 0,
        endedAt: 0,
        messageCount: 2, // user + assistant
        metadata: { command: true, executedAt: new Date().toISOString() },
      }));
    } catch (error) {
      logger.error('Failed to store command messages', { error, sessionId });
    }
    
    return result.response || '';
  }

  // Process AI messages with potential multi-round tool execution
  return await AIiteration(logger, safeMessage, channel, { ...options, sessionId, sessionRepo, messageRepo });
}


export { handle };