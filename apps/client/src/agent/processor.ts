// import { ILogger } from '@/infrastructure/logger';
import { handleCommand, isCommand } from './commands';

function toSafeMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  try {
    return String(input);
  } catch {
    return '';
  }
}

function previewMessage(message: string, maxLen = 200): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

/**
 * Process user messages and generate responses
 * This is a mock implementation that will be replaced with Ollama integration
 */
export async function processUserMessage(
  // logger: ILogger,
  message: unknown,
  source: 'telegram' | 'tui'
): Promise<string> {
  const safeMessage = toSafeMessage(message);

  // Keep logs lightweight (tests may send very large inputs)
  console.log(`Processing message from ${source}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source });
    return result.response || '';
  }

  // Default response
  return `I'm currently a mock response.\nOllama integration coming soon with full functionality!`;
}