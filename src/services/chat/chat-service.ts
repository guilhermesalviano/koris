import { getAIProvider, AIProviderRole } from "../providers";
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

    return this.completionService.complete(promptPayload, {
      signal: options?.signal,
      audit: { channel, sessionId, runId: options?.runId },
    });
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
  static create(logger: ILogger, role: AIProviderRole = 'manager', agentName?: string): IChatService {
    const db = DatabaseServiceFactory.create();
    const aiProvider = getAIProvider(logger, role);
    const promptRepository = PromptRepositoryFactory.create(db, logger, aiProvider);
    const completionService = new AICompletionService(aiProvider, logger, { role, agentName });
    return new ChatService(completionService, promptRepository);
  }
}

export { ChatService, ChatServiceFactory };
