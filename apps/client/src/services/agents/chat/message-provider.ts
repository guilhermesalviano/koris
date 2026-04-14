
import { getAIProvider } from "../../providers";
import { escapeTelegramMarkdown, isAbortError } from "../../../utils/telegram";
import { ILogger } from "../../../infrastructure/logger";
import { SkillsRepository } from "../../../repository/skills";
import { ToolCall } from "../../orchestrator/worker/executor";
import type { AIChatRequest } from "../../../types/provider";
import { MessageBuilderFactory } from "../../../repository/messages";

type ProcessedMessage = string | ToolCall[] | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal, toolsEnabled?: boolean };

async function messageProvider(
  logger: ILogger,
  message: string,
  channel: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const messageBuilder = MessageBuilderFactory.create();
  const provider = getAIProvider({ logger });
  const skillsRepository = new SkillsRepository(logger);
  const skills = skillsRepository.get();
  const payload = messageBuilder.buildMessages({ message, channel, skills, toolsEnabled: options?.toolsEnabled });

  logger.info("Generated prompt:", payload as unknown as Record<string, unknown>);

  const chatRequest = payload as AIChatRequest;

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


export { messageProvider };