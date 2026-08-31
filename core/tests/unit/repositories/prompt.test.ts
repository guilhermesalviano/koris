import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptRepository } from '../../../src/repositories/prompt';
import { Memory } from '../../../src/entities/memory';
import type { ILogger } from '../../../src/infrastructure/logger';
import { config } from '../../../src/config';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeMemory(overrides: Partial<ConstructorParameters<typeof Memory>[0]> = {}): Memory {
  return new Memory({
    sessionId: 'session-1',
    source: 'whatsapp',
    type: 'fact',
    content: 'User likes coffee.',
    ...overrides,
  });
}

function makeRepository(overrides: Partial<{
  memoryRepository: any;
  learnedSkillsRepository: any;
  stickerRulesRepository: any;
  toolsRepository: any;
  aiProvider: any;
  logger: ILogger;
}> = {}) {
  return new PromptRepository(
    { get: vi.fn().mockReturnValue('') } as any,
    overrides.toolsRepository ?? { getAll: vi.fn().mockReturnValue([]), getStickerTools: vi.fn().mockReturnValue([]), getSearchTools: vi.fn().mockReturnValue([]) },
    overrides.learnedSkillsRepository ?? { getRecent: vi.fn().mockReturnValue([]) },
    overrides.stickerRulesRepository ?? { getRecent: vi.fn().mockReturnValue([]) },
    overrides.memoryRepository ?? {
      getAll: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
    },
    overrides.aiProvider ?? { embed: vi.fn() },
    overrides.logger ?? makeLogger(),
  );
}

describe('PromptRepository buildMemoryContext', () => {
  const originalEmbeddingEnabled = config.AI.EMBED.ENABLED;

  beforeEach(() => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = originalEmbeddingEnabled;
  });

  it('injects memory context from the most recent memories when embeddings are disabled', async () => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = false;

    const memoryRepository = {
      getAll: vi.fn().mockReturnValue([
        makeMemory({ id: 'm1', source: 'whatsapp', content: 'User likes coffee.' }),
        makeMemory({ id: 'm2', source: 'telegram', content: 'Lives in SP.' }),
      ]),
      search: vi.fn(),
    };
    const aiProvider = { embed: vi.fn() };
    const repository = makeRepository({ memoryRepository, aiProvider });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      sessionId: 'session-current',
    });

    expect(memoryRepository.getAll).toHaveBeenCalledWith('session-current');
    expect(aiProvider.embed).not.toHaveBeenCalled();
    expect(memoryRepository.search).not.toHaveBeenCalled();

    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('# Cross-session Memory Context');
    expect(systemContent).toContain('### channel: whatsapp');
    expect(systemContent).toContain('- User likes coffee.');
    expect(systemContent).toContain('### channel: telegram');
    expect(systemContent).toContain('- Lives in SP.');
  });

  it('limits the fallback to the most recent memories', async () => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = false;

    const recent = Array.from({ length: 25 }, (_, i) =>
      makeMemory({ id: `m${i}`, content: `memory ${i}` })
    );
    const memoryRepository = {
      getAll: vi.fn().mockReturnValue(recent),
      search: vi.fn(),
    };
    const repository = makeRepository({ memoryRepository });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('- memory 0');
    expect(systemContent).not.toContain('- memory 20');
  });

  it('injects memory context from semantic search when embeddings are enabled', async () => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = true;

    const memoryRepository = {
      getAll: vi.fn(),
      search: vi.fn().mockReturnValue([makeMemory({ id: 'm1', content: 'Relevant memory.' })]),
    };
    const aiProvider = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const repository = makeRepository({ memoryRepository, aiProvider });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      sessionId: 'session-current',
    });

    expect(aiProvider.embed).toHaveBeenCalledWith('Hello');
    expect(memoryRepository.search).toHaveBeenCalledWith([0.1, 0.2], 20, 'session-current');
    expect(memoryRepository.getAll).not.toHaveBeenCalled();

    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('# Cross-session Memory Context');
    expect(systemContent).toContain('- Relevant memory.');
  });

  it('omits the memory block when there are no memories', async () => {
    (config.AI.EMBED as { ENABLED: boolean }).ENABLED = false;

    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    const systemContent = messages[0].content as string;
    expect(systemContent).not.toContain('# Cross-session Memory Context');
  });
});

describe('PromptRepository tool results', () => {
  it('attaches images to the user message and preserves images in history', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'describe this',
      channel: 'whatsapp',
      images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
      messageHistory: [
        { role: 'user', content: 'older photo', images: [{ data: 'b2xk', mimeType: 'image/jpeg' }] },
      ],
    });

    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'describe this',
      images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
    });
    expect(messages).toContainEqual({
      role: 'user',
      content: 'older photo',
      images: [{ data: 'b2xk', mimeType: 'image/jpeg' }],
    });
  });

  it('omits images from the user message when none are provided', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('injects the image analysis instruction when the current message has images', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'describe this',
      channel: 'whatsapp',
      images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
    });

    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('# Image Analysis Instructions');
    expect(systemContent).toContain('do NOT call search_engine or curl_request');
  });

  it('omits the image analysis instruction when no images are provided', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[0].content).not.toContain('# Image Analysis Instructions');
  });

  it('appends tool results as tool-role messages after the user message', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolResults: [
        { role: 'tool', content: 'Tool: ls, Result: a' },
        { role: 'tool', content: 'Tool: pwd, Result: /home' },
      ],
    });

    expect(messages[messages.length - 3]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[messages.length - 2]).toEqual({ role: 'tool', content: 'Tool: ls, Result: a' });
    expect(messages[messages.length - 1]).toEqual({ role: 'tool', content: 'Tool: pwd, Result: /home' });
  });

  it('omits tool messages when none are provided', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages.some((m) => m.role === 'tool')).toBe(false);
  });

  it('emits tool_call_id and tool_calls on provider messages', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolResults: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: 'ls', arguments: { flags: '-l' } } }],
        },
        { role: 'tool', content: 'Tool: ls, Result: a', tool_call_id: 'call_1' },
      ],
    });

    expect(messages[messages.length - 2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', function: { name: 'ls', arguments: { flags: '-l' } } }],
    });
    expect(messages[messages.length - 1]).toEqual({
      role: 'tool',
      content: 'Tool: ls, Result: a',
      tool_call_id: 'call_1',
    });
  });

  it('does not sanitize tool result content', async () => {
    const originalEnabled = config.AI.PROMPT_SANITIZER;
    (config.AI.PROMPT_SANITIZER as boolean) = true;
    try {
      const repository = makeRepository();

      const { messages } = await repository.build({
        userMessage: 'I really want to go.',
        channel: 'whatsapp',
        toolResults: [{ role: 'tool', content: 'a a a b b b' }],
      });

      expect(messages[messages.length - 1].content).toBe('a a a b b b');
    } finally {
      (config.AI.PROMPT_SANITIZER as boolean) = originalEnabled;
    }
  });
});

describe('PromptRepository extraSystemBlocks', () => {
  it('appends situation-specific contract blocks to the system prompt', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      extraSystemBlocks: ['# Contract One', '# Contract Two'],
    });

    const systemContent = messages[0].content as string;
    expect(systemContent).toContain('# Contract One');
    expect(systemContent).toContain('# Contract Two');
  });

  it('omits extra blocks when none are provided', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[0].content).not.toContain('# Contract One');
  });
});

describe('PromptRepository learned skills gating', () => {
  it('injects learned skills into the system prompt by default', async () => {
    const repository = makeRepository({
      learnedSkillsRepository: {
        getRecent: vi.fn().mockReturnValue([
          { name: 'docs', description: 'Doc helper', content: 'Use docs first.', read_when: ['when needed'] },
        ]),
      },
    });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[0].content).toContain('# Learned Skills Content');
    expect(messages[0].content).toContain('### Skill: docs');
  });

  it('omits learned skills when learnedSkillsEnabled is false', async () => {
    const repository = makeRepository({
      learnedSkillsRepository: {
        getRecent: vi.fn().mockReturnValue([
          { name: 'docs', description: 'Doc helper', content: 'Use docs first.', read_when: ['when needed'] },
        ]),
      },
    });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      learnedSkillsEnabled: false,
    });

    expect(messages[0].content).not.toContain('# Learned Skills Content');
    expect(messages[0].content).not.toContain('### Skill: docs');
  });
});

describe('PromptRepository sticker tools gating', () => {
  const originalStickersEnabled = config.STICKERS.ENABLED;

  afterEach(() => {
    (config.STICKERS as { ENABLED: boolean }).ENABLED = originalStickersEnabled;
  });

  it('includes sticker tools alongside the full toolset for trusted senders', async () => {
    const getAll = vi.fn().mockReturnValue([{ type: 'function', function: { name: 'curl_request', parameters: {} } }]);
    const toolsRepository = { getAll, getStickerTools: vi.fn().mockReturnValue([]), getSearchTools: vi.fn().mockReturnValue([]) };
    const repository = makeRepository({ toolsRepository });

    await repository.build({ userMessage: 'Hello', channel: 'whatsapp', toolsEnabled: true });

    expect(getAll).toHaveBeenCalledWith({ includeBeatTools: undefined, includeStickerTools: true });
  });

  it('excludes sticker tools from the full toolset when the master flag is off', async () => {
    (config.STICKERS as { ENABLED: boolean }).ENABLED = false;
    const getAll = vi.fn().mockReturnValue([]);
    const toolsRepository = { getAll, getStickerTools: vi.fn().mockReturnValue([]), getSearchTools: vi.fn().mockReturnValue([]) };
    const repository = makeRepository({ toolsRepository });

    await repository.build({ userMessage: 'Hello', channel: 'whatsapp', toolsEnabled: true });

    expect(getAll).toHaveBeenCalledWith({ includeBeatTools: undefined, includeStickerTools: false });
  });

  it('returns only sticker tools for an untrusted sender when stickersEnabled is on', async () => {
    const getStickerTools = vi.fn().mockReturnValue([{ type: 'function', function: { name: 'send_sticker', parameters: {} } }]);
    const toolsRepository = { getAll: vi.fn(), getStickerTools, getSearchTools: vi.fn().mockReturnValue([]) };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      stickersEnabled: true,
    });

    expect(getStickerTools).toHaveBeenCalled();
    expect(toolsRepository.getAll).not.toHaveBeenCalled();
    expect(tools).toEqual([{ type: 'function', function: { name: 'send_sticker', parameters: {} } }]);
  });

  it('returns no tools for an untrusted sender when stickersEnabled is off', async () => {
    const toolsRepository = { getAll: vi.fn(), getStickerTools: vi.fn(), getSearchTools: vi.fn().mockReturnValue([]) };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      stickersEnabled: false,
    });

    expect(toolsRepository.getStickerTools).not.toHaveBeenCalled();
    expect(toolsRepository.getAll).not.toHaveBeenCalled();
    expect(tools).toBeUndefined();
  });

  it('returns no tools for an untrusted sender when the master sticker flag is off, even if stickersEnabled is on', async () => {
    (config.STICKERS as { ENABLED: boolean }).ENABLED = false;
    const toolsRepository = { getAll: vi.fn(), getStickerTools: vi.fn(), getSearchTools: vi.fn().mockReturnValue([]) };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      stickersEnabled: true,
    });

    expect(toolsRepository.getStickerTools).not.toHaveBeenCalled();
    expect(tools).toBeUndefined();
  });
});

describe('PromptRepository search tools gating', () => {
  it('returns only search tools for an untrusted sender when searchEnabled is on', async () => {
    const getSearchTools = vi.fn().mockReturnValue([{ type: 'function', function: { name: 'search_engine', parameters: {} } }]);
    const toolsRepository = { getAll: vi.fn(), getStickerTools: vi.fn().mockReturnValue([]), getSearchTools };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      searchEnabled: true,
    });

    expect(getSearchTools).toHaveBeenCalled();
    expect(toolsRepository.getAll).not.toHaveBeenCalled();
    expect(tools).toEqual([{ type: 'function', function: { name: 'search_engine', parameters: {} } }]);
  });

  it('returns sticker and search tools together for an untrusted sender when both are enabled', async () => {
    const getStickerTools = vi.fn().mockReturnValue([{ type: 'function', function: { name: 'send_sticker', parameters: {} } }]);
    const getSearchTools = vi.fn().mockReturnValue([{ type: 'function', function: { name: 'search_engine', parameters: {} } }]);
    const toolsRepository = { getAll: vi.fn(), getStickerTools, getSearchTools };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      stickersEnabled: true,
      searchEnabled: true,
    });

    expect(tools).toEqual([
      { type: 'function', function: { name: 'send_sticker', parameters: {} } },
      { type: 'function', function: { name: 'search_engine', parameters: {} } },
    ]);
  });

  it('returns no tools for an untrusted sender when searchEnabled is off', async () => {
    const toolsRepository = { getAll: vi.fn(), getStickerTools: vi.fn().mockReturnValue([]), getSearchTools: vi.fn() };
    const repository = makeRepository({ toolsRepository });

    const { tools } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
      toolsEnabled: false,
      searchEnabled: false,
    });

    expect(toolsRepository.getSearchTools).not.toHaveBeenCalled();
    expect(toolsRepository.getAll).not.toHaveBeenCalled();
    expect(tools).toBeUndefined();
  });
});

describe('PromptRepository sticker rules', () => {
  it('injects learned stickers into the system prompt', async () => {
    const getRecent = vi.fn().mockReturnValue([
      { id: 'sr1', description: 'when the user is happy' },
    ]);
    const repository = makeRepository({
      stickerRulesRepository: { getRecent },
    });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[0].content).toContain('# Learned Stickers');
    expect(messages[0].content).toContain('id: sr1 — when the user is happy');
    expect(getRecent).toHaveBeenCalledWith(20, 'whatsapp');
  });

  it('omits the sticker block when there are no learned stickers', async () => {
    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    expect(messages[0].content).not.toContain('# Learned Stickers');
  });

  it('scopes the sticker lookup to the requesting channel', async () => {
    const getRecent = vi.fn().mockReturnValue([]);
    const repository = makeRepository({
      stickerRulesRepository: { getRecent },
    });

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'telegram',
    });

    expect(messages[0].content).not.toContain('# Learned Stickers');
    expect(getRecent).toHaveBeenCalledWith(20, 'telegram');
  });
});

describe('PromptRepository prompt sanitizer', () => {
  const originalEnabled = config.AI.PROMPT_SANITIZER;

  beforeEach(() => {
    (config.AI.PROMPT_SANITIZER as boolean) = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI.PROMPT_SANITIZER as boolean) = originalEnabled;
  });

  it('sanitizes the user message and history and logs aggregate stats when enabled', async () => {
    const logger = makeLogger();
    const repository = makeRepository({ logger });

    const { messages } = await repository.build({
      userMessage: 'I really want to go to the store. I really want to go to the store.',
      channel: 'whatsapp',
      messageHistory: [
        { role: 'user', content: 'hello hello world' },
        { role: 'assistant', content: 'hi there' },
      ],
    });

    expect(messages[messages.length - 1].content).toBe('I want to go to the store.');
    expect(messages[1].content).toBe('hello world');
    expect(logger.info).toHaveBeenCalledWith('[prompt-sanitizer] prompt sanitized', expect.objectContaining({
      originalChars: expect.any(Number),
      sanitizedChars: expect.any(Number),
      removedChars: expect.any(Number),
      removedWords: expect.any(Number),
      removedFillers: expect.any(Number),
      dedupedLines: expect.any(Number),
      dedupedSentences: expect.any(Number),
      percentReduced: expect.any(Number),
    }));
  });

  it('leaves messages untouched and skips logging when disabled', async () => {
    (config.AI.PROMPT_SANITIZER as boolean) = false;
    const logger = makeLogger();
    const repository = makeRepository({ logger });

    const { messages } = await repository.build({
      userMessage: 'I I really want to go.',
      channel: 'whatsapp',
      messageHistory: [{ role: 'user', content: 'hello hello world' }],
    });

    expect(messages[messages.length - 1].content).toBe('I I really want to go.');
    expect(messages[1].content).toBe('hello hello world');
    expect(logger.info).not.toHaveBeenCalledWith('[prompt-sanitizer] prompt sanitized', expect.anything());
  });
});
