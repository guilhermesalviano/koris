import { buildMessages } from "../ai/prompt/messages";
import { getAIProvider } from "../ai/providers";
import { escapeTelegramMarkdown, isAbortError } from "../utils/telegram";
import { ILogger } from "../infrastructure/logger";
import { SkillsRepository } from "../repository/skills";
import { ToolCall } from "../orchestrator/worker/executor";

type ProcessedMessage = string | ToolCall[] | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal, toolsEnabled?: boolean };

async function messageProvider(
  logger: ILogger,
  message: string,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider({ logger });
  const skillsRepository = new SkillsRepository(logger);
  const skills = skillsRepository.get();
  const prompt = buildMessages({ message, channel, skills, toolsEnabled: options?.toolsEnabled });

  logger.info("Generated prompt:", prompt);

  try {
    return await provider.chat(prompt, { signal: options?.signal });
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

async function messageProviderStream(
  logger: ILogger,
  message: string,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider({ logger });
  const prompt = buildMessages({ message, channel });

  // Stream directly in TUI when using Ollama.
  if (channel === 'tui' && provider.name === 'ollama') {
    const stream = provider.chatStream(prompt, { signal: options?.signal });

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
    return await provider.chat(prompt, { signal: options?.signal });
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

export { messageProvider, messageProviderStream };