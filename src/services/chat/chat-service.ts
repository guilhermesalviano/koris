import { createAIProvider } from "../providers";
import { escapeTelegramMarkdown, isAbortError } from "../../utils/telegram";
import { ILogger } from "../../infrastructure/logger";
import { IPromptRepository, PromptRepositoryFactory } from "../../repositories/prompt";
import { ProcessedMessage, ProcessOptions } from "../../types/agents";
import { DatabaseServiceFactory } from "../../infrastructure/db-sqlite";
import { AICompletionService, IAICompletionService } from "../ai-completion-service";
import type { AIResponse, IChatService } from "../../types/chat";
import type { Message } from "../../entities/message";

class ChatService implements IChatService {
  constructor(
    private readonly completionService: IAICompletionService,
    private readonly promptRepository: IPromptRepository,
  ) { }

  async complete(
    message: string,
    channel: string,
    options?: ProcessOptions,
    messageHistory?: Message[],
    sessionId?: string
  ): Promise<AIResponse> {
    const messagesHistory = messageHistory?.map(m => ({ role: m.role, content: m.content }));
    const promptPayload = await this.promptRepository.build({
      userMessage: message,
      channel,
      toolsEnabled: options?.toolsEnabled,
      messageHistory: messagesHistory,
      sessionId
    });

    try {
      return await this.completionService.complete(promptPayload, { signal: options?.signal });
    } catch (err) {
      if (options?.signal?.aborted || isAbortError(err)) {
        throw err;
      }
      const detail = err instanceof Error ? err.message : String(err);
      const text = channel === 'telegram'
        ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
        : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
      return { kind: 'message', text, finishReason: 'unknown' };
    }
  }

  async handler(
    message: string,
    channel: string,
    options?: ProcessOptions,
    messageHistory?: Message[],
    sessionId?: string
  ): Promise<ProcessedMessage> {
    const response = await this.complete(message, channel, options, messageHistory, sessionId);
    if (response.kind === 'message') return response.text;
    return JSON.stringify({
      tool_calls: response.calls.map(call => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    });
  }
}

class ChatServiceFactory {
  static create(logger: ILogger): IChatService {
    const db = DatabaseServiceFactory.create();
    const aiProvider = createAIProvider(logger);
    const promptRepository = PromptRepositoryFactory.create(db, logger, aiProvider);
    const completionService = new AICompletionService(aiProvider, logger);
    return new ChatService(completionService, promptRepository);
  }
}

export { ChatService, ChatServiceFactory };
