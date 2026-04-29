import { ILogger } from "../../../infrastructure/logger";
import { AIChatRequest } from "../../../types/provider";
import { escapeTelegramMarkdown, isAbortError } from "../../../utils/telegram";
import { SkillsRepository } from "../../../repositories/skills";
import { PromptRepositoryFactory } from "../../../repositories/prompt";
import { getAIProvider } from "../../providers";
import { ToolCall } from "../../../types/tools";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { ProcessOptions } from "../../../types/agents";
import type { Message } from "../../../entities/message";

type ProcessedMessage = string | ToolCall[] | AsyncGenerator<string>;

async function messageProviderStream(
  logger: ILogger,
  message: string,
  channel: string,
  options?: ProcessOptions,
  messageHistory?: Message[]
): Promise<ProcessedMessage> {
  const provider = getAIProvider({ logger });
  const skillsRepository = new SkillsRepository(logger);
  const skills = skillsRepository.get();

  const db = DatabaseServiceFactory.create();
  const promptRepository = PromptRepositoryFactory.create(db);
  const messagesHistory = messageHistory?.map(m => ({ role: m.role, content: m.content }));
  const payload = promptRepository.build({
    userMessage: message,
    channel,
    skills,
    toolsEnabled: options?.toolsEnabled,
    messageHistory: messagesHistory,
  });

  const chatRequest = payload as AIChatRequest;

  // Stream directly in TUI for the active AI provider
  if (channel === 'tui') {
    const thinkRequest: AIChatRequest = { ...chatRequest, think: true };
    const stream = provider.chatStream(thinkRequest, { signal: options?.signal });

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
