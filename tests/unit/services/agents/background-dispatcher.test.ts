import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundDispatcher } from '../../../../src/services/agents/background-dispatcher';
import { applyTestConfigDefaults } from '../../../helpers/test-config';
import type { ILogger } from '../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeDispatcher(overrides: {
  conversationRun?: ReturnType<typeof vi.fn>;
  summarizerHandler?: ReturnType<typeof vi.fn>;
} = {}) {
  const logger = makeLogger();
  const conversationWorker = {
    run: overrides.conversationRun ?? vi.fn().mockResolvedValue(undefined),
  };
  const summarizerWorker = {
    handler: overrides.summarizerHandler ?? vi.fn().mockResolvedValue(undefined),
  };

  const dispatcher = new BackgroundDispatcher(
    logger,
    conversationWorker as never,
    summarizerWorker as never,
  );

  return { dispatcher, logger, conversationWorker, summarizerWorker };
}

const persistProps = { sessionId: 'session-1', ask: 'hi', answer: 'hello', channel: 'tui' };

describe('BackgroundDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyTestConfigDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the conversation through the conversation worker', () => {
    const { dispatcher, conversationWorker } = makeDispatcher();

    dispatcher.persistConversation(persistProps);

    expect(conversationWorker.run).toHaveBeenCalledWith(persistProps);
  });

  it('logs when conversation persistence fails', async () => {
    const { dispatcher, logger } = makeDispatcher({
      conversationRun: vi.fn().mockRejectedValue(new Error('db down')),
    });

    dispatcher.persistConversation(persistProps);
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Background conversation processing failed',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });

  it('summarizes the conversation when the summarizer is enabled', () => {
    applyTestConfigDefaults({ summarizerEnabled: true });
    const { dispatcher, summarizerWorker } = makeDispatcher();
    const memoryService = { upsert: vi.fn() };

    dispatcher.summarizeConversation({ ...persistProps, memoryService: memoryService as never });

    expect(summarizerWorker.handler).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', memoryService }),
    );
  });

  it('does not summarize when the summarizer is disabled', () => {
    applyTestConfigDefaults({ summarizerEnabled: false });
    const { dispatcher, summarizerWorker } = makeDispatcher();

    dispatcher.summarizeConversation({ ...persistProps, memoryService: { upsert: vi.fn() } as never });

    expect(summarizerWorker.handler).not.toHaveBeenCalled();
  });

  it('logs when summarization fails', async () => {
    applyTestConfigDefaults({ summarizerEnabled: true });
    const { dispatcher, logger } = makeDispatcher({
      summarizerHandler: vi.fn().mockRejectedValue(new Error('summarizer down')),
    });

    dispatcher.summarizeConversation({ ...persistProps, memoryService: { upsert: vi.fn() } as never });
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Background summarizer failed',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });
});
