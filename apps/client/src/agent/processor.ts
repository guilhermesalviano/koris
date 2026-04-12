import { getAIProvider } from '../ai';
import { handleCommand, isCommand } from './commands';

type ProcessedMessage = string | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal };

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

function escapeTelegramMarkdown(text: string): string {
  // Tests expect escaping for '.' and '-' at minimum.
  // NOTE: Telegram "Markdown" vs "MarkdownV2" escaping differs; keep it minimal + test-driven.
  return text.replace(/([\\._-])/g, '\\$1');
}

async function handleStreamChat(
  message: string,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider();
  const request = {
    messages: [
      {
        role: 'system' as const,
        content:
          'You are opencrawdio, a concise AI Assistant. Be direct and helpful. If the user asks to read/list/search/write/run commands, describe what you would do and ask for approval when needed.',
      },
      { role: 'user' as const, content: message },
    ],
  };

  // Stream directly in TUI when using Ollama.
  if (source === 'tui' && provider.name === 'ollama') {
    const stream = provider.chatStream(request, { signal: options?.signal });

    async function* safeStream(): AsyncGenerator<string> {
      try {
        for await (const chunk of stream) {
          if (options?.signal?.aborted) return;
          yield chunk;
        }
      } catch (err) {
        if (options?.signal?.aborted || isAbortError(err)) return;
        const detail = err instanceof Error ? err.message : String(err);
        yield `\n(AI provider error: ${detail})`;
      }
    }

    return safeStream();
  }

  try {
    return await provider.chat(request, { signal: options?.signal });
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    return source === 'telegram'
      ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
      : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
  }
}

async function handleChat(
  message: string,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider();
  const request = {
    messages: [
      {
        role: 'system' as const,
        content:
          'You are opencrawdio, a concise AI Assistant. Be direct and helpful. If the user asks to read/list/search/write/run commands, describe what you would do and ask for approval when needed.',
      },
      { role: 'user' as const, content: message },
    ],
  };

  try {
    return await provider.chat(request, { signal: options?.signal });
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    return source === 'telegram'
      ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
      : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
  }
}

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. Non-commands are routed to the configured AI provider.
 */
export async function processUserMessage(
  // logger: ILogger,
  message: unknown,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  // Keep logs lightweight (tests may send very large inputs)
  console.log(`Processing message from ${source}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source });
    return result.response || '';
  }

  if (source === 'tui') {
    return handleStreamChat(safeMessage, source, options);
  }
  return await handleChat(safeMessage, source, options);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
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
