import { Skill } from '../../types/skills';
import { SystemInfoRepository } from '../../repository/system-info';
import { buildAITools } from '../../orchestrator/tools';
import type { AIChatRequest, AIToolDefinition } from '../../types/provider';

type MessageRole = 'system' | 'user' | 'assistant';

interface Message {
  role: MessageRole;
  content: string;
}

interface BuildMessagesParams {
  message: string;
  channel: 'telegram' | 'tui';
  skills?: Skill[];
  toolsEnabled?: boolean;
}

interface MessageBuilderConfig {
  baseSystemPrompt?: string;
  includeSystemInfo?: boolean;
  includeTools?: boolean;
}

/**
 * Service for building AI message payloads.
 * Composes system prompts, user messages, and tool definitions.
 */
class MessageBuilderService {
  private readonly defaultSystemPrompt = 'You are a Personal Assistant. Be direct.';

  constructor(
    private systemInfoRepository: SystemInfoRepository,
    private config: MessageBuilderConfig = {}
  ) {}

  /**
   * Build complete message payload for AI provider
   */
  buildMessages(params: BuildMessagesParams): AIChatRequest {
    const messages: Message[] = [];

    // Add system prompts
    messages.push(...this.buildSystemMessages(params));

    // Add user message
    messages.push(this.buildUserMessage(params.message));

    // Build tools if enabled
    const tools = this.buildTools(params);

    return {
      messages,
      tools,
    };
  }

  /**
   * Build system-level messages (base prompt + context)
   */
  private buildSystemMessages(params: BuildMessagesParams): Message[] {
    const systemMessages: Message[] = [];

    // Base system prompt
    const basePrompt = this.config.baseSystemPrompt ?? this.defaultSystemPrompt;
    systemMessages.push(this.createMessage('system', basePrompt));

    // System info context
    if (this.config.includeSystemInfo !== false) {
      const systemInfo = this.systemInfoRepository.loadSystemInfoPrompt({
        channel: params.channel,
      });
      systemMessages.push(this.createMessage('system', systemInfo));
    }

    return systemMessages;
  }

  /**
   * Build user message
   */
  private buildUserMessage(content: string): Message {
    return this.createMessage('user', content);
  }

  /**
   * Build tools array if enabled
   */
  private buildTools(params: BuildMessagesParams): AIToolDefinition[] | undefined {
    const toolsEnabled = params.toolsEnabled ?? this.config.includeTools ?? true;

    if (!toolsEnabled) {
      return undefined;
    }

    return buildAITools(params.skills);
  }

  /**
   * Create a message object
   */
  private createMessage(role: MessageRole, content: string): Message {
    return { role, content };
  }

  /**
   * Add assistant message to existing conversation
   */
  addAssistantMessage(
    payload: AIChatRequest,
    content: string
  ): AIChatRequest {
    return {
      ...payload,
      messages: [
        ...payload.messages,
        this.createMessage('assistant', content),
      ],
    };
  }

  /**
   * Add user follow-up message
   */
  addUserMessage(payload: AIChatRequest, content: string): AIChatRequest {
    return {
      ...payload,
      messages: [...payload.messages, this.createMessage('user', content)],
    };
  }

  /**
   * Create a new builder with different configuration
   */
  withConfig(config: Partial<MessageBuilderConfig>): MessageBuilderService {
    return new MessageBuilderService(this.systemInfoRepository, {
      ...this.config,
      ...config,
    });
  }
}

/**
 * Factory for creating message builder instances
 */
class MessageBuilderFactory {
  static create(
    systemInfoRepository: SystemInfoRepository,
    config?: MessageBuilderConfig
  ): MessageBuilderService {
    return new MessageBuilderService(systemInfoRepository, config);
  }

  static createDefault(): MessageBuilderService {
    return new MessageBuilderService(new SystemInfoRepository());
  }
}

// Singleton instance for backward compatibility
const defaultBuilder = MessageBuilderFactory.createDefault();

/**
 * Backward-compatible function export
 */
export function buildMessages(params: BuildMessagesParams): AIChatRequest {
  return defaultBuilder.buildMessages(params);
}

export {
  Message,
  MessageRole,
  BuildMessagesParams,
  MessageBuilderConfig,
  MessageBuilderService,
  MessageBuilderFactory,
  defaultBuilder as messageBuilder,
};