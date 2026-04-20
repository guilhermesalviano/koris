import { getAIProvider } from "../../providers";
import { escapeTelegramMarkdown, isAbortError } from "../../../utils/telegram";
import { ILogger } from "../../../infrastructure/logger";
import { SkillsRepository } from "../../../repositories/skills";
import type { AIChatRequest } from "../../../types/provider";
import { PromptRepositoryFactory } from "../../../repositories/prompt";
import { ToolCall } from "../../../types/tools";
import { Message } from "../../../entities/message";
import { ProcessOptions } from "../../../types/agents";

type ProcessedMessage = string | ToolCall[] | AsyncGenerator<string>;

async function messageProvider(
  logger: ILogger,
  message: string,
  channel: string,
  options?: ProcessOptions,
  messageHistory?: Message[]
): Promise<ProcessedMessage> {
  const provider = getAIProvider({ logger });
  const skillsRepository = new SkillsRepository(logger);
  const skills = skillsRepository.get();
  const promptRepository = PromptRepositoryFactory.create();
  
  const historyMessages = messageHistory?.map(m => ({ role: m.role, content: m.content }));
  
  const payload = promptRepository.build({ 
    userMessage: message, 
    channel, 
    skills, 
    toolsEnabled: options?.toolsEnabled,
    messageHistory: historyMessages
  });

  logger.info(`Prompt generated in ${new Date().toISOString()}:`, payload as unknown as Record<string, unknown>);

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