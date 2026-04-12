import { handleCommand, isCommand } from './commands';
import { getAIProvider } from '../ai/providers';
import { previewMessage, toSafeMessage } from './helpers';
import { messageProvider } from '../services/chat';

type ProcessedMessage = string | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal };

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 */
export async function handle(
  // logger: ILogger,
  message: unknown,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  // Keep logs lightweight (tests may send very large inputs)
  console.log(`Processing message from ${channel}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source: channel });
    return result.response || '';
  }

  return await messageProvider(safeMessage, channel, options);
}

export async function healthCheck(): Promise<{ status: 'ok' | 'error'; timestamp: string; details?: string }> {
  const provider = getAIProvider();
  try {
    const health = await provider.healthCheck();
    return { status: health.ok === true ? 'ok' : 'error', timestamp: new Date().toISOString() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 'error', timestamp: new Date().toISOString(), details: detail };
  }
}
