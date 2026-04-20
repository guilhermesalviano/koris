import { Skill } from '../types/skills';
import { ISystemInfoRepository, SystemInfoRepositoryFactory } from './system-info';
import type { AIChatRequest, AIToolDefinition } from '../types/provider';
import { IToolsRepository, ToolsRepositoryFactory } from './tools';
import { MessageRole } from '../types/messages';
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from './learned-skills';
import { IDatabaseService } from '../infrastructure/db-sqlite';

interface Message {
  role: MessageRole;
  content: string;
}

interface BuildPromptParams {
  userMessage: string;
  channel: string;
  skills?: Skill[];
  toolsEnabled?: boolean;
  messageHistory?: Message[];
}

interface PromptConfig {
  systemPrompt?: string;
  includeSystemInfo?: boolean;
  includeTools?: boolean;
}

/**
 * Repository for building and managing AI prompts.
 * Composes system prompts, user messages, and tool definitions.
 */
class PromptRepository {
  private readonly defaultSystemPrompt =
    'You are a Personal Assistant. Be direct. Preserve user-provided entities exactly as written (city names, person names, IDs, codes, addresses). Never auto-correct, translate, expand, or infer a different entity unless the user explicitly asks.';

  constructor(
    private systemInfoRepository: ISystemInfoRepository,
    private toolsRepository: IToolsRepository,
    private learnedSkillsRepository: ILearnedSkillsRepository,
    private config: PromptConfig = {},
  ) {}

  /**
   * Build complete prompt payload for AI provider
   */
  build(params: BuildPromptParams): AIChatRequest {
    const messages = this.buildMessages(params);
    const tools = this.buildTools(params);

    return { messages, tools };
  }

  /**
   * Build all messages (system + history + user)
   */
  private buildMessages(params: BuildPromptParams): Message[] {
    return [
      ...this.buildSystemPrompt(params.channel),
      ...(params.messageHistory || []),
      this.buildUserMessage(params.userMessage),
    ];
  }

  /**
   * Build system prompt messages
   */
  private buildSystemPrompt(channel: string): Message[] {
    const messages: Message[] = [];

    // Base system prompt
    const basePrompt = this.config.systemPrompt ?? this.defaultSystemPrompt;
    const learnedSkillsPrompt = this.learnedSkillsRepository.getAll();
    const baseHistory = basePrompt + "\n" + learnedSkillsPrompt.map((skill) => {
      return `${skill.skill_name}: ${skill.skill_content}`;
    }).join("\n");
    messages.push({ role: 'system', content: baseHistory });

    // System info context
    if (this.config.includeSystemInfo !== false) {
      const systemInfo = this.systemInfoRepository.loadSystemInfoPrompt({ channel });
      if (systemInfo) messages.push({ role: 'system', content: systemInfo });
    }

    return messages;
  }

  /**
   * Build user message
   */
  private buildUserMessage(content: string): Message {
    return { role: 'user', content };
  }

  /**
   * Build tools if enabled
   */
  private buildTools(params: BuildPromptParams): AIToolDefinition[] | undefined {
    const toolsEnabled = params.toolsEnabled ?? this.config.includeTools ?? true;
    
    if (!toolsEnabled) {
      return undefined;
    }

    return this.toolsRepository.getAll(params.skills);
  }

  /**
   * Extend existing conversation with assistant response
   */
  appendAssistant(payload: AIChatRequest, content: string): AIChatRequest {
    return this.appendMessage(payload, 'assistant', content);
  }

  /**
   * Extend existing conversation with user message
   */
  appendUser(payload: AIChatRequest, content: string): AIChatRequest {
    return this.appendMessage(payload, 'user', content);
  }

  /**
   * Append a message to existing payload
   */
  private appendMessage(
    payload: AIChatRequest,
    role: MessageRole,
    content: string
  ): AIChatRequest {
    return {
      ...payload,
      messages: [...payload.messages, { role, content }],
    };
  }

  /**
   * Create a new repository instance with merged configuration
   */
  withConfig(config: Partial<PromptConfig>): PromptRepository {
    return new PromptRepository(
      this.systemInfoRepository,
      this.toolsRepository,
      this.learnedSkillsRepository,
      { ...this.config, ...config }
    );
  }
}

class PromptRepositoryFactory {
  static create(db: IDatabaseService, config?: PromptConfig): PromptRepository {
    const systemInfoRepository = SystemInfoRepositoryFactory.create();
    const toolsRepository = ToolsRepositoryFactory.create();
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    return new PromptRepository(systemInfoRepository, toolsRepository, learnedSkillsRepository, config);
  }
}

export {
  Message,
  MessageRole,
  BuildPromptParams,
  PromptConfig,
  PromptRepository,
  PromptRepositoryFactory,
};