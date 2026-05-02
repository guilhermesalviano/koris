import { Skill } from '../types/skills';
import { IContextRepository, ContextRepositoryFactory } from './context';
import type { AIChatRequest, AIToolDefinition } from '../types/provider';
import { IToolsRepository, ToolsRepositoryFactory } from './tools';
import { Message, MessageRole } from '../types/messages';
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from './learned-skills';
import { IMemoryRepository, MemoryRepositoryFactory } from './memory';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { SYSTEM_PROMPT } from '../constants';

interface BuildPromptParams {
  userMessage: string;
  channel: string;
  skills?: Skill[];
  toolsEnabled?: boolean;
  messageHistory?: Message[];
}

interface PromptConfig {
  systemPrompt?: string;
  includeTools?: boolean;
  includeTaskTools?: boolean;
  learnedSkillsLimit?: number;
  learnedSkillsMaxChars?: number;
}

const DEFAULT_LEARNED_SKILLS_LIMIT = 10;
const DEFAULT_LEARNED_SKILLS_MAX_CHARS = 8000;

interface IPromptRepository {
  build(params: BuildPromptParams): AIChatRequest;
  appendAssistant(payload: AIChatRequest, content: string): AIChatRequest;
  appendUser(payload: AIChatRequest, content: string): AIChatRequest;
  withConfig(config: Partial<PromptConfig>): PromptRepository;
}

/**
 * Repository for building and managing AI prompts.
 * Composes system prompts, user messages, and tool definitions.
 */
class PromptRepository implements IPromptRepository {
  constructor(
    private contextRepository: IContextRepository,
    private toolsRepository: IToolsRepository,
    private learnedSkillsRepository: ILearnedSkillsRepository,
    private memoryRepository: IMemoryRepository,
    private config: PromptConfig = {},
  ) {}

  /**
   * Used to build the prompt. But can also be used to rebuild prompts with updated config, context and history.
   * @param params BuildPromptParams
   * @returns AIChatRequest
   */
  build(params: BuildPromptParams): AIChatRequest {
    const messages = this.buildHistory(params);
    const tools = this.buildTools(params);

    return { messages, tools };
  }

  /**
   * Build all messages (system + history + user)
   */
  private buildHistory({ channel, userMessage, messageHistory }: BuildPromptParams): Message[] {
    return [
      ...this.buildSystemPrompt(channel),
      ...(messageHistory || []),
      this.buildUserMessage(userMessage),
    ];
  }

  /**
   * Build system prompt messages
   */
  private buildSystemPrompt(channel: string): Message[] {
    const messages: Message[] = [];

    const basePrompt = this.config.systemPrompt ?? SYSTEM_PROMPT;
    const baseHistory = this.buildBaseHistoryPrompt(basePrompt);

    // TODO: get only old and relevant memories instead of all. Exclude actual session.
    const memory = this.buildMemoryContext();
    let systemInstructions = memory ? `
      ${baseHistory}\n Persistent context from other sessions: ${memory}` : baseHistory;

    const context = this.contextRepository.get({ channel });
    if (context) systemInstructions += `\n Additional system info: \n${context}`;

    messages.push({ role: 'system', content: systemInstructions });

    return messages;
  }

  private buildMemoryContext(): string {
    const memories = this.memoryRepository.getAll().map(m => `${m.type}: ${m.content}`).join('\n');
    return memories.slice(0, 8000);
  }

  /**
   * Build base prompt + bounded learned skills context
   */
  private buildBaseHistoryPrompt(basePrompt: string): string {
    const learnedSkillsLimit = this.config.learnedSkillsLimit ?? DEFAULT_LEARNED_SKILLS_LIMIT;
    const learnedSkillsMaxChars = this.config.learnedSkillsMaxChars ?? DEFAULT_LEARNED_SKILLS_MAX_CHARS;
    const learnedSkills = this.learnedSkillsRepository.getRecent(learnedSkillsLimit);

    if (learnedSkills.length === 0 || learnedSkillsMaxChars <= 0) {
      return basePrompt;
    }

    let usedChars = 0;
    const learnedSkillsLines: string[] = [];

    for (const skill of learnedSkills) {
      const line = `${skill.skill_name}: ${skill.skill_content}`;
      const remainingChars = learnedSkillsMaxChars - usedChars;

      if (remainingChars <= 0) {
        break;
      }

      if (line.length <= remainingChars) {
        learnedSkillsLines.push(line);
        usedChars += line.length;
        continue;
      }

      if (remainingChars > 4) {
        learnedSkillsLines.push(`${line.slice(0, remainingChars - 3)}...`);
      }

      break;
    }

    if (learnedSkillsLines.length === 0) {
      return basePrompt;
    }

    return `${basePrompt}\n ${learnedSkillsLines.join("\n")}`;
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
  private buildTools({ skills, toolsEnabled }: BuildPromptParams): AIToolDefinition[] | undefined {
    const toolsEnabledFinal = toolsEnabled ?? this.config.includeTools ?? true;
    
    if (!toolsEnabledFinal) {
      return undefined;
    }

    return this.toolsRepository.getAll(skills, {
      includeTaskTools: this.config.includeTaskTools ?? true,
    });
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
      this.contextRepository,
      this.toolsRepository,
      this.learnedSkillsRepository,
      this.memoryRepository,
      { ...this.config, ...config }
    );
  }
}

class PromptRepositoryFactory {
  static create(db: IDatabaseService, config?: PromptConfig): PromptRepository {
    const contextRepository = ContextRepositoryFactory.create();
    const toolsRepository = ToolsRepositoryFactory.create();
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    const memoryRepository = MemoryRepositoryFactory.create(db);
    return new PromptRepository(contextRepository, toolsRepository, learnedSkillsRepository, memoryRepository, config);
  }
}

export { IPromptRepository, PromptRepository, PromptRepositoryFactory };
