import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../../../../src/services/agents/main-agent/agent';
import { config } from '../../../../../src/config';
import type { ILogger } from '../../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeDeps() {
  return {
    messageService: { getHistory: vi.fn(), save: vi.fn() },
    memoryService: { upsert: vi.fn() },
    conversationWorker: { run: vi.fn().mockResolvedValue(undefined) },
    summarizerWorker: { handler: vi.fn().mockResolvedValue(undefined) },
    manager: { run: vi.fn().mockResolvedValue('assistant reply') },
  };
}

function makeAgent(channel = 'tui', sessionId = 'session-1') {
  const logger = makeLogger();
  const deps = makeDeps();
  const agent = new Agent(
    logger,
    deps.messageService as never,
    deps.memoryService as never,
    deps.conversationWorker as never,
    deps.summarizerWorker as never,
    deps.manager as never,
    channel,
    sessionId,
  );
  return { agent, logger, deps };
}

describe('Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(config.AI.SUMMARIZER, 'ENABLED', { value: true, configurable: true });
  });

  it('handles slash commands without calling the manager', async () => {
    const { agent, deps } = makeAgent();

    const result = await agent.handle('/help');

    expect(deps.manager.run).not.toHaveBeenCalled();
    expect(result).toContain('/help');
  });

  it('delegates regular messages to the manager', async () => {
    const { agent, deps } = makeAgent('web');

    const result = await agent.handle('hello there');

    expect(deps.manager.run).toHaveBeenCalledWith({
      userMessage: 'hello there',
      channel: 'web',
      message: deps.messageService,
      options: {},
    });
    expect(result).toBe('assistant reply');
  });

  it('passes process options through to the manager', async () => {
    const { agent, deps } = makeAgent();
    const onProgress = vi.fn();
    const controller = new AbortController();

    await agent.handle('run task', { onProgress, signal: controller.signal, toolsEnabled: true });

    expect(deps.manager.run).toHaveBeenCalledWith({
      userMessage: 'run task',
      channel: 'tui',
      message: deps.messageService,
      options: { onProgress, signal: controller.signal, toolsEnabled: true },
    });
  });

  it('persists conversation history in the background', async () => {
    const { agent, deps } = makeAgent();

    await agent.handle('question');
    await vi.waitFor(() => {
      expect(deps.conversationWorker.run).toHaveBeenCalledWith({
        sessionId: 'session-1',
        ask: 'question',
        answer: 'assistant reply',
        channel: 'tui',
      });
    });
  });

  it('triggers the summarizer for non-command messages', async () => {
    const { agent, deps } = makeAgent();

    await agent.handle('question');
    await vi.waitFor(() => {
      expect(deps.summarizerWorker.handler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          ask: 'question',
          answer: 'assistant reply',
          type: 'summary',
          channel: 'tui',
          memoryService: deps.memoryService,
        }),
      );
    });
  });

  it('does not trigger the summarizer when disabled in config', async () => {
    const originalEnabled = config.AI.SUMMARIZER.ENABLED;
    Object.defineProperty(config.AI.SUMMARIZER, 'ENABLED', { value: false, configurable: true });

    try {
      const { agent, deps } = makeAgent();
      await agent.handle('question');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(deps.summarizerWorker.handler).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(config.AI.SUMMARIZER, 'ENABLED', { value: originalEnabled, configurable: true });
    }
  });

  it('coerces non-string input before processing', async () => {
    const { agent, deps } = makeAgent();

    await agent.handle(null as unknown as string);

    expect(deps.manager.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: '' }),
    );
  });

  it('logs when background conversation processing fails', async () => {
    const { agent, logger, deps } = makeAgent();
    deps.conversationWorker.run.mockRejectedValue(new Error('db down'));

    await agent.handle('question');
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Background conversation processing failed',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });
});
