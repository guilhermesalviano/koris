import { IContextRepository, ContextRepositoryFactory } from './context';
import type { AIChatRequest, AIToolDefinition, AIProvider } from '../types/chat';
import { IToolsRepository, ToolsRepositoryFactory } from './tools';
import { Message, ImageAttachment } from '../types/messages';
import { Memory } from '../entities/memory';
import { ILearnedSkillsRepository, LearnedSkillsRepositoryFactory } from './learned-skills';
import { IStickerRulesRepository, StickerRulesRepositoryFactory } from './sticker-rules';
import { IMemoryRepository, MemoryRepositoryFactory } from './memory';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { ILogger } from '../infrastructure/logger';
import { InjectManager } from '../services/inject-manager';
import { SYSTEM_PROMPT, IMAGE_ANALYSIS_INSTRUCTION } from '../constants';
import { config } from '../config';
import { sanitizePrompt, SanitizeStats } from '../utils/prompt-sanitizer';

const CHAT_HISTORY_LIMIT = 20;
const MEMORY_CONTEXT_LIMIT = 20;
const STICKER_RULES_LIMIT = 20;

function sumStats(target: SanitizeStats, source: SanitizeStats): void {
  target.originalLength += source.originalLength;
  target.sanitizedLength += source.sanitizedLength;
  target.removedChars += source.removedChars;
  target.removedWords += source.removedWords;
  target.removedFillers += source.removedFillers;
  target.dedupedLines += source.dedupedLines;
  target.dedupedSentences += source.dedupedSentences;
}

interface BuildPromptParams {
  userMessage: string;
  channel: string;
  images?: ImageAttachment[];
  toolsEnabled?: boolean;
  learnedSkillsEnabled?: boolean;
  messageHistory?: Message[];
  includeBeatTools?: boolean;
  sessionId?: string;
  /** Situation-specific contract/instruction blocks appended to the system prompt. */
  extraSystemBlocks?: string[];
  /** Tool execution results sent to the provider under the `tool` role. */
  toolResults?: Message[];
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
    private stickerRulesRepository: IStickerRulesRepository,
    private memoryRepository: IMemoryRepository,
    private embedProvider: AIProvider,
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

  private async buildHistory({
    channel,
    userMessage,
    images,
    messageHistory,
    sessionId,
    extraSystemBlocks,
    toolResults,
    learnedSkillsEnabled,
    toolsEnabled,
  }: BuildPromptParams): Promise<Message[]> {
    const systemBlocks: string[] = [SYSTEM_PROMPT];

    for (const block of extraSystemBlocks ?? []) {
      systemBlocks.push(block);
    }

    if (images?.length) {
      systemBlocks.push(IMAGE_ANALYSIS_INSTRUCTION);
    }

    const injectedContent = InjectManager.getInjectedContent();
    if (injectedContent) systemBlocks.push(`# Personality\n${injectedContent}`);

    const learnedSkills = this.buildLearnedSkills({ learnedSkillsEnabled });
    if (learnedSkills) systemBlocks.push(`# Learned Skills Content\n${learnedSkills}`);

    const stickerRules = (toolsEnabled ?? true) ? this.buildStickerRules(channel) : '';
    if (stickerRules) systemBlocks.push(`# Learned Stickers\n${stickerRules}`);

    const memory = await this.buildMemoryContext(userMessage, sessionId);
    if (memory) systemBlocks.push(`# Long-term Memory Context\n${memory}`);

    const context = this.contextRepository.get({ channel });
    if (context) systemBlocks.push(`# Session Context\n${context}`);

    const limitedHistory = messageHistory?.slice(-CHAT_HISTORY_LIMIT) ?? [];

    const sanitized = this.sanitizePromptIfEnabled(userMessage, limitedHistory);

    const toolMessages: Message[] = toolResults?.map((r) => {
      const message: Message = { role: r.role, content: r.content };
      if (r.tool_call_id) message.tool_call_id = r.tool_call_id;
      if (r.tool_calls?.length) message.tool_calls = r.tool_calls;
      return message;
    }) ?? [];

    return [
      { role: 'system', content: systemBlocks.join('\n') },
      ...sanitized.history,
      { role: 'user', content: sanitized.userMessage, ...(images?.length ? { images } : {}) },
      ...toolMessages,
    ];
  }

  private sanitizePromptIfEnabled(userMessage: string, history: Message[]): { userMessage: string; history: Message[] } {
    if (!config.AI.PROMPT_SANITIZER) {
      return { userMessage, history };
    }

    const aggregate: SanitizeStats = {
      originalLength: 0,
      sanitizedLength: 0,
      removedChars: 0,
      removedWords: 0,
      removedFillers: 0,
      dedupedLines: 0,
      dedupedSentences: 0,
      percentReduced: 0,
    };

    const sanitizedHistory = history.map((message) => {
      const result = sanitizePrompt(message.content);
      sumStats(aggregate, result.stats);
      return { ...message, content: result.text };
    });

    const userResult = sanitizePrompt(userMessage);
    sumStats(aggregate, userResult.stats);

    aggregate.percentReduced = aggregate.originalLength > 0
      ? Math.round((aggregate.removedChars / aggregate.originalLength) * 100)
      : 0;

    this.logger.info('[prompt-sanitizer] prompt sanitized', {
      originalChars: aggregate.originalLength,
      sanitizedChars: aggregate.sanitizedLength,
      removedChars: aggregate.removedChars,
      removedWords: aggregate.removedWords,
      removedFillers: aggregate.removedFillers,
      dedupedLines: aggregate.dedupedLines,
      dedupedSentences: aggregate.dedupedSentences,
      percentReduced: aggregate.percentReduced,
    });

    return { userMessage: userResult.text, history: sanitizedHistory };
  }

  private buildLearnedSkills({ learnedSkillsEnabled }: { learnedSkillsEnabled?: boolean }): string {
    if (learnedSkillsEnabled === false) {
      return '';
    }

    const learnedSkillsLimit = config.LEARNED_SKILLS_LIMIT;

    return this.learnedSkillsRepository
      .getRecent(learnedSkillsLimit)
      .map(skill => {
        const header = `### Skill: ${skill.name}`;
        const description = skill.description ? `\n${skill.description}` : '';
        const readWhen = skill.read_when?.length ? `\nRead when: ${skill.read_when.join(', ')}` : '';
        return `${header}${description}${readWhen}\n${skill.content ?? ''}`;
      })
      .join('\n\n')
      .slice(0, 15000);
  }

  private buildStickerRules(channel: string): string {
    const rules = this.stickerRulesRepository.getRecent(STICKER_RULES_LIMIT, channel);
    if (rules.length === 0) return '';

    const list = rules.map((rule) => `- id: ${rule.id} — ${rule.description}`).join('\n');
    return `WhatsApp cannot attach a caption to a sticker: send_sticker always delivers it as its own message, separate from any text you also return. If the sticker alone answers the request, return an empty final message.\n${list}`.slice(0, 15000);
  }

  private async buildMemoryContext(userMessage: string, sessionId?: string): Promise<string> {
    if (config.AI.EMBED.ENABLED) {
      try {
        const queryEmbedding = await this.embedProvider.embed(userMessage);
        const memories = this.memoryRepository.search(queryEmbedding, MEMORY_CONTEXT_LIMIT, sessionId);
        if (memories.length > 0) {
          return this.formatMemories(memories);
        }
      } catch (e) {
        this.logger.warn('Failed to embed user message for memory retrieval; falling back to recent memories', { error: e instanceof Error ? e.message : String(e) });
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
    if (!(toolsEnabled ?? true)) {
      return undefined;
    }

    return this.toolsRepository.getAll({ includeBeatTools });
  }
}

class PromptRepositoryFactory {
  static create(db: IDatabaseService, logger: ILogger, embedProvider: AIProvider): PromptRepository {
    const contextRepository = ContextRepositoryFactory.create();
    const toolsRepository = ToolsRepositoryFactory.create();
    const learnedSkillsRepository = LearnedSkillsRepositoryFactory.create(db);
    const stickerRulesRepository = StickerRulesRepositoryFactory.create(db);
    const memoryRepository = MemoryRepositoryFactory.create(db, logger);
    return new PromptRepository(contextRepository, toolsRepository, learnedSkillsRepository, stickerRulesRepository, memoryRepository, embedProvider, logger);
  }
}

export { IPromptRepository, PromptRepository, PromptRepositoryFactory };
