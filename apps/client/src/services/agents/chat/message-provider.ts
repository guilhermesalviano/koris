import { getAIProvider } from "../../providers";
import { escapeTelegramMarkdown, isAbortError } from "../../../utils/telegram";
import { ILogger } from "../../../infrastructure/logger";
import { SkillsRepository } from "../../../repositories/skills";
import type { AIChatRequest } from "../../../types/provider";
import { PromptRepositoryFactory } from "../../../repositories/prompt";
import { ToolCall } from "../../../types/tools";
import { Message } from "../../../entities/message";
import { ProcessOptions } from "../../../types/agents";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";

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

  /**
   * Todo:
   * passa prompt repository as dependency
   */
  const db = DatabaseServiceFactory.create();
  const promptRepository = PromptRepositoryFactory.create(db);
  
  const messagesHistory = messageHistory?.map(m => ({ role: m.role, content: m.content }));

  // to fix: probaly, assistant messages is not saving im this prompt build... Its not good.
  const payload = promptRepository.build({ 
    userMessage: message, 
    channel, 
    skills, 
    toolsEnabled: options?.toolsEnabled,
    messageHistory: messagesHistory
  });
  
  logger.info(`paylod prompt value ${JSON.stringify(payload)}`);
  // logger.info(`Prompt generated in ${new Date().toISOString()}:`, payload as unknown as Record<string, unknown>);

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