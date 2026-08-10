import { IContextRepository, ContextRepositoryFactory } from './context';
import type { AIChatRequest, AIToolDefinition, AIProvider } from '../types/chat';
import { IToolsRepository, ToolsRepositoryFactory } from './tools';
import { Message } from '../types/messages';
import { Memory } from '../entities/memory';
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from './learned-skills';
import { IMemoryRepository, MemoryRepositoryFactory } from './memory';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { SkillsRepositoryFactory } from './skills';
import { ILogger } from '../infrastructure/logger';
import { InjectManager } from '../services/inject-manager';
import { SYSTEM_PROMPT } from '../constants';
import { config } from '../config';

const CHAT_HISTORY_LIMIT = 20;
const MEMORY_CONTEXT_LIMIT = 20;

interface BuildPromptParams {
  userMessage: string;
  channel: string;
  toolsEnabled?: boolean;
  messageHistory?: Message[];
  includeBeatTools?: boolean;
  sessionId?: string;
}

interface IPromptRepository {
  build(params: BuildPromptParams): Promise<AIChatRequest>;
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
    private aiProvider: AIProvider,
    private logger: ILogger,
  ) {}

  /**
   * Used to build the prompt. But can also be used to rebuild prompts with updated config, context and history.
   * @param params BuildPromptParams
   * @returns AIChatRequest
   */
  async build(params: BuildPromptParams): Promise<AIChatRequest> {
    const messages = await this.buildHistory(params);
    const tools = this.buildTools(params);

    return { messages, tools };
  }

  private async buildHistory({ channel, userMessage, messageHistory, sessionId }: BuildPromptParams): Promise<Message[]> {
    const systemBlocks: string[] = [SYSTEM_PROMPT];

    const injectedContent = InjectManager.getInjectedContent();
    if (injectedContent) systemBlocks.push(injectedContent);

    const learnedSkills = this.buildLearnedSkills();
    if (learnedSkills) systemBlocks.push(`# Learned Skills Content\n${learnedSkills}`);

    const memory = await this.buildMemoryContext(userMessage, sessionId);
    if (memory) systemBlocks.push(`# Cross-session Memory Context\n${memory}`);

    const context = this.contextRepository.get({ channel });
    if (context) systemBlocks.push(`# Session Context\n${context}`);

    const limitedHistory = messageHistory?.slice(-CHAT_HISTORY_LIMIT) ?? [];

    // need more tests
    // if (limitedHistory.length > 0 || memory) {
    //   systemBlocks.push("Direct answer preferred based on provided context.");
    // }

    return [
      { role: 'system', content: systemBlocks.join('\n\n') },
      ...limitedHistory,
      { role: 'user', content: userMessage },
    ];
  }

  private buildLearnedSkills(): string {
    const learnedSkillsLimit = config.LEARNED_SKILLS_LIMIT;

    return this.learnedSkillsRepository
      .getRecent(learnedSkillsLimit)
      .map(skill => skill.skill_content?.trim())
      .filter((content): content is string => Boolean(content))
      .join('\n')
      .slice(0, 15000);
  }

  private async buildMemoryContext(userMessage: string, sessionId?: string): Promise<string> {
    if (config.AI.EMBEDDING.ENABLED) {
      try {
        const queryEmbedding = await this.aiProvider.embed(userMessage);
        const memories = this.memoryRepository.search(queryEmbedding, MEMORY_CONTEXT_LIMIT, sessionId);

        if (memories.length === 0) {
          return '';
        }

        return this.formatMemories(memories);
      } catch (e) {
        this.logger.warn('Failed to embed user message for memory retrieval', { error: e instanceof Error ? e.message : String(e) });
        return '';
      }
    }

    const memories = this.memoryRepository.getAll(sessionId).slice(0, MEMORY_CONTEXT_LIMIT);

    if (memories.length === 0) {
      return '';
    }

    return this.formatMemories(memories);
  }

  private formatMemories(memories: Memory[]): string {
    const groupedMemories = memories.reduce((acc, memory) => {
      const source = memory.source || 'Unknown';
      if (!acc[source]) {
        acc[source] = [];
      }
      acc[source].push(memory);
      return acc;
    }, {} as Record<string, typeof memories>);

    let contextString = '';
    for (const [source, sourceMemories] of Object.entries(groupedMemories)) {
      contextString += `\n### channel: ${source}\n`;
      contextString += sourceMemories.map(m => `- ${m.content}`).join('\n');
      contextString += '\n';
    }

    return contextString.trim().slice(0, 15000);
  }

  private buildTools({ toolsEnabled, includeBeatTools }: BuildPromptParams): AIToolDefinition[] | undefined {
    const toolsEnabledFinal = toolsEnabled ?? true;
    
    if (!toolsEnabledFinal) {
      return undefined;
    }

    return this.toolsRepository.getAll({
      includeBeatTools,
    });
  }
}

class PromptRepositoryFactory {
  static create(db: IDatabaseService, logger: ILogger, aiProvider: AIProvider): PromptRepository {
    const contextRepository = ContextRepositoryFactory.create();
    const skillsRepository = SkillsRepositoryFactory.create(logger);
    const toolsRepository = ToolsRepositoryFactory.create(skillsRepository.get());
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    const memoryRepository = MemoryRepositoryFactory.create(db);
    return new PromptRepository(contextRepository, toolsRepository, learnedSkillsRepository, memoryRepository, aiProvider, logger);
  }
}

export { IPromptRepository, PromptRepository, PromptRepositoryFactory };
