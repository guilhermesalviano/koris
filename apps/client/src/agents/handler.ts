import { handleCommand, isCommand } from './commands';
import { previewMessage, toSafeMessage } from './helpers';
import { messageProvider } from '../services/chat';
import { ILogger } from '../infrastructure/logger';
import { extractToolCalls } from '../utils/tool-calls';
import { Orchestrator } from '../orchestrator';
import { config } from '../config';

type ProcessedMessage = string;
type ProcessOptions = { signal?: AbortSignal, toolsEnabled?: boolean };

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 */
async function handle(
  logger: ILogger,
  message: unknown,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  // Keep logs lightweight (tests may send very large inputs)
  logger.info(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    return result.response || '';
  }

  const result = await messageProvider(logger, safeMessage, channel, options);

  const toolCalls = extractToolCalls(typeof result === 'string' ? result : '');

  let finalResult: ProcessedMessage;
  if (toolCalls.length > 0) {
    logger.info('Message contains tool calls', { channel });

    const orchestrator = new Orchestrator(logger);
    finalResult = await orchestrator.handleToolCalls(toolCalls, { model: config.AI.MODEL }, options?.signal || new AbortController().signal);

    /**
     * learn and try again
     */
    if (result.toString().includes('get_skill')) {
      logger.info('content to learn', { content: result.toString() });

      const buildATwoFactorPrompt = `Extract how to use in ` + `\n${finalResult}\n\nOriginal Question:\n${safeMessage}`;
      logger.info('buildATwoFactorPrompt', { buildATwoFactorPrompt });
      

      // deve retornar um evento em CURL 
      const secondResult = await messageProvider(logger, buildATwoFactorPrompt, channel, { signal: options?.signal, toolsEnabled: false });
      finalResult = typeof secondResult === 'string' ? secondResult : JSON.stringify(secondResult);
      logger.info('secondResult', { secondResult });
    }
  } else {
    finalResult = typeof result === 'string' ? result : JSON.stringify(result);
  }

  return finalResult;
}

export { handle };