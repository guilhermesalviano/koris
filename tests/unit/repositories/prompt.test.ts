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
  aiProvider: any;
  logger: ILogger;
}> = {}) {
  return new PromptRepository(
    { get: vi.fn().mockReturnValue('') } as any,
    { getAll: vi.fn().mockReturnValue([]) } as any,
    { getRecent: vi.fn().mockReturnValue([]) } as any,
    overrides.memoryRepository ?? {
      getAll: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
    },
    overrides.aiProvider ?? { embed: vi.fn() },
    overrides.logger ?? makeLogger(),
  );
}

describe('PromptRepository buildMemoryContext', () => {
  const originalEmbeddingEnabled = config.AI.WORKERS.EMBEDDING_ENABLED;

  beforeEach(() => {
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = originalEmbeddingEnabled;
  });

  it('injects memory context from the most recent memories when embeddings are disabled', async () => {
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = false;

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
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = false;

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
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = true;

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
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = false;

    const repository = makeRepository();

    const { messages } = await repository.build({
      userMessage: 'Hello',
      channel: 'whatsapp',
    });

    const systemContent = messages[0].content as string;
    expect(systemContent).not.toContain('# Cross-session Memory Context');
  });
});

describe('PromptRepository prompt sanitizer', () => {
  const originalEnabled = config.AI.PROMPT_SANITIZER.ENABLED;

  beforeEach(() => {
    (config.AI.PROMPT_SANITIZER as { ENABLED: boolean }).ENABLED = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI.PROMPT_SANITIZER as { ENABLED: boolean }).ENABLED = originalEnabled;
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
    (config.AI.PROMPT_SANITIZER as { ENABLED: boolean }).ENABLED = false;
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
