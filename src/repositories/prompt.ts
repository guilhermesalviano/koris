import { IContextRepository, ContextRepositoryFactory } from './context';
import type { AIChatRequest, AIToolDefinition } from '../types/chat';
import { IToolsRepository, ToolsRepositoryFactory } from './tools';
import { Message } from '../types/messages';
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from './learned-skills';
import { IMemoryRepository, MemoryRepositoryFactory } from './memory';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { SkillsRepositoryFactory } from './skills';
import { ILogger } from '../infrastructure/logger';
import { InjectManager } from '../services/inject-manager';
import { SYSTEM_PROMPT } from '../constants';

const DEFAULT_LEARNED_SKILLS_LIMIT = 10;

interface BuildPromptParams {
  userMessage: string;
  channel: string;
  toolsEnabled?: boolean;
  messageHistory?: Message[];
  includeTaskTools?: boolean;
}

interface IPromptRepository {
  build(params: BuildPromptParams): AIChatRequest;
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

  private buildHistory({ channel, userMessage, messageHistory }: BuildPromptParams): Message[] {
    const hasSoul = true;
    let systemInstructions = (hasSoul ? '' : SYSTEM_PROMPT);

    const injectedContent = InjectManager.getInjectedContent();
    if (injectedContent) systemInstructions += injectedContent;

    const learnedSkills = this.buildLearnedSkills();
    if (learnedSkills) systemInstructions += `\n\n# Learned Skills Content\n${learnedSkills}`;

    const memory = this.buildMemoryContext();
    if (memory) systemInstructions += `\n\n# Cross-session Memory\n${memory}`;

    const context = this.contextRepository.get({ channel });
    if (context) systemInstructions += `\n\n# Session Context\n${context}`;

    return [
      { role: 'system', content: systemInstructions },
      ...(messageHistory || []),
      { role: 'user', content: userMessage },
    ];
  }

  private buildLearnedSkills(): string | undefined {
    const learnedSkillsLimit = DEFAULT_LEARNED_SKILLS_LIMIT;
    return this.learnedSkillsRepository
      .getRecent(learnedSkillsLimit)
      .map(skill => skill.skill_content?.trim())
      .filter((content): content is string => Boolean(content))
      .join('\n')
      .slice(0, 15000);
  }

  private buildMemoryContext(): string {
    const memories = this.memoryRepository.getAll().map(m => `${m.type}: ${m.content}`).join('\n');
    return memories.slice(0, 15000);
  }

  private buildTools({ toolsEnabled, includeTaskTools }: BuildPromptParams): AIToolDefinition[] | undefined {
    const toolsEnabledFinal = toolsEnabled ?? true;
    
    if (!toolsEnabledFinal) {
      return undefined;
    }

    return this.toolsRepository.getAll({
      includeTaskTools,
    });
  }
}

class PromptRepositoryFactory {
  static create(db: IDatabaseService, logger: ILogger): PromptRepository {
    const contextRepository = ContextRepositoryFactory.create();
    const skillsRepository = SkillsRepositoryFactory.create(logger);
    const toolsRepository = ToolsRepositoryFactory.create(skillsRepository.get());
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    const memoryRepository = MemoryRepositoryFactory.create(db);
    return new PromptRepository(contextRepository, toolsRepository, learnedSkillsRepository, memoryRepository);
  }
}

export { IPromptRepository, PromptRepository, PromptRepositoryFactory };
