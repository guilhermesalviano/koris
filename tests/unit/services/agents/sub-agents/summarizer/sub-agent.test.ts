import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Summarizer } from '../../../../../../src/services/agents/sub-agents/summarizer/sub-agent';
import type { ILogger } from '../../../../../../src/infrastructure/logger';
import * as providerRegistry from '../../../../../../src/services/providers';
import { config } from '../../../../../../src/config';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeProps(overrides: Partial<{
  sessionId: string;
  ask: string;
  answer: string;
  channel: string;
}> = {}) {
  return {
    sessionId: 'session-1',
    ask: 'What is TypeScript?',
    answer: 'TypeScript is a typed superset of JavaScript.',
    channel: 'tui',
    memoryService: { save: vi.fn() },
    ...overrides,
  };
}

describe('Summarizer', () => {
  const originalEmbeddingEnabled = config.AI.WORKERS.EMBEDDING_ENABLED;

  beforeEach(() => {
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = originalEmbeddingEnabled;
  });

  it('stores parsed memory type and content from AI JSON', async () => {
    vi.spyOn(providerRegistry, 'getAIProvider').mockReturnValue({
      embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    } as any);

    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({
        kind: 'message',
        text: '{"type":"fact","content":"TS adds static typing."}',
      }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(completionService.complete).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: expect.stringContaining('What is TypeScript?') }],
    });
    expect(props.memoryService.save).toHaveBeenCalledWith({
      type: 'fact',
      content: 'TS adds static typing.',
      embedding: [0.1, 0.2],
    });
    expect(logger.info).toHaveBeenCalledWith('Summarizer worker completed for session session-1');
  });

  it('defaults to summary when AI returns plain text', async () => {
    vi.spyOn(providerRegistry, 'getAIProvider').mockReturnValue({
      embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    } as any);

    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({ kind: 'message', text: 'TS adds static typing.' }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(props.memoryService.save).toHaveBeenCalledWith({
      type: 'summary',
      content: 'TS adds static typing.',
      embedding: [0.1, 0.2],
    });
  });

  it('skips embedding generation when embeddings are disabled', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2]);
    vi.spyOn(providerRegistry, 'getAIProvider').mockReturnValue({ embed } as any);
    (config.AI.WORKERS as { EMBEDDING_ENABLED: boolean }).EMBEDDING_ENABLED = false;

    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({
        kind: 'message',
        text: '{"type":"fact","content":"TS adds static typing."}',
      }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(embed).not.toHaveBeenCalled();
    expect(props.memoryService.save).toHaveBeenCalledWith({
      type: 'fact',
      content: 'TS adds static typing.',
      embedding: undefined,
    });
    expect(logger.info).toHaveBeenCalledWith('Summarizer worker completed for session session-1');
  });

  it('logs an error when the model returns tool calls', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({
        kind: 'tool_calls',
        calls: [{ name: 'noop', arguments: {} }],
      }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(props.memoryService.save).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to summarize for session session-1',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('logs an error when completion fails', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockRejectedValue(new Error('provider offline')),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(props.memoryService.save).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to summarize for session session-1',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
