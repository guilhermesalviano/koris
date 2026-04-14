import { ILogger } from "../../../infrastructure/logger";
import { AIChatRequest } from "../../../types/provider";
import { escapeTelegramMarkdown, isAbortError } from "../../../utils/telegram";
import { MessageBuilderFactory } from "../../../repositories/messages";
import { getAIProvider } from "../../providers";
import { ToolCall } from "../../../types/tools";

type ProcessedMessage = string | ToolCall[] | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal, toolsEnabled?: boolean };

async function messageProviderStream(
  logger: ILogger,
  message: string,
  channel: string,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const messageBuilder = MessageBuilderFactory.create();
  const provider = getAIProvider({ logger });
  const payload = messageBuilder.buildMessages({ message, channel });

  // Cast MessagePayload to AIChatRequest (compatible types)
  const chatRequest = payload as AIChatRequest;

  // Stream directly in TUI when using Ollama.
  if (channel === 'tui' && provider.name === 'ollama') {
    const stream = provider.chatStream(chatRequest, { signal: options?.signal });

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
    return await provider.chat(chatRequest, { signal: options?.signal });
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    return channel === 'telegram'
      ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
      : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
  }
}

export { messageProviderStream };