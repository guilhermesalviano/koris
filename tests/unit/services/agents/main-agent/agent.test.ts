import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../../../../../src/services/agents/main-agent/agent';
import { MessageServiceFactory } from '../../../../../src/services/message-service';
import { MemoryServiceFactory } from '../../../../../src/services/memory-service';
import { applyTestConfigDefaults } from '../../../../helpers/test-config';
import type { ILogger } from '../../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeDeps() {
  return {
    messageService: { getHistory: vi.fn(), getSessionId: vi.fn(), save: vi.fn() },
    memoryService: { upsert: vi.fn() },
    conversationWorker: { run: vi.fn().mockResolvedValue(undefined) },
    summarizerWorker: { handler: vi.fn().mockResolvedValue(undefined) },
    manager: { run: vi.fn().mockResolvedValue('assistant reply') },
  };
}

function makeAgent(channel = 'tui', sessionId = 'session-1') {
  const logger = makeLogger();
  const deps = makeDeps();
  const sessionService = {
    getSession: vi.fn().mockReturnValue({ id: sessionId }),
    ensureActiveSession: vi.fn().mockReturnValue({ id: sessionId }),
    updateCount: vi.fn(),
  };
  const sessionManager = {
    getSessionService: vi.fn().mockReturnValue(sessionService),
    getSessionServiceById: vi.fn(),
  };

  vi.spyOn(MessageServiceFactory, 'create').mockReturnValue(deps.messageService as never);
  vi.spyOn(MemoryServiceFactory, 'create').mockReturnValue(deps.memoryService as never);

  const agent = new Agent(
    logger,
    {} as never,
    sessionManager as never,
    deps.conversationWorker as never,
    deps.summarizerWorker as never,
    deps.manager as never,
    channel,
  );
  return { agent, logger, deps, sessionService, sessionManager };
}

describe('Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyTestConfigDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles slash commands without calling the manager', async () => {
    const { agent, deps } = makeAgent();

    const result = await agent.handle('/help', 'origin-1');

    expect(deps.manager.run).not.toHaveBeenCalled();
    expect(result).toContain('/help');
  });

  it('delegates regular messages to the manager', async () => {
    const { agent, deps } = makeAgent('web');

    const result = await agent.handle('hello there', 'origin-1');

    expect(deps.manager.run).toHaveBeenCalledWith({
      userMessage: 'hello there',
      channel: 'web',
      message: deps.messageService,
      options: { runId: expect.any(String) },
    });
    expect(result).toBe('assistant reply');
  });

  it('passes process options through to the manager', async () => {
    const { agent, deps } = makeAgent();
    const onProgress = vi.fn();
    const controller = new AbortController();

    await agent.handle('run task', 'origin-1', { onProgress, signal: controller.signal, toolsEnabled: true });

    expect(deps.manager.run).toHaveBeenCalledWith({
      userMessage: 'run task',
      channel: 'tui',
      message: deps.messageService,
      options: { onProgress, signal: controller.signal, toolsEnabled: true, runId: expect.any(String) },
    });
  });

  it('resolves a specific session when a sessionId is provided', async () => {
    const { agent, deps, sessionManager } = makeAgent('web');
    const byIdService = {
      getSession: vi.fn().mockReturnValue({ id: 'session-by-id' }),
      ensureActiveSession: vi.fn().mockReturnValue({ id: 'session-by-id' }),
      updateCount: vi.fn(),
    };
    sessionManager.getSessionServiceById.mockReturnValue(byIdService);

    await agent.handle('hello', 'origin-1', { sessionId: 'session-by-id' });

    expect(sessionManager.getSessionServiceById).toHaveBeenCalledWith('session-by-id');
    expect(sessionManager.getSessionService).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(deps.conversationWorker.run).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-by-id' }),
      );
    });
  });

  it('falls back to the source session when the session id is unknown', async () => {
    const { agent, sessionManager } = makeAgent('web', 'session-1');
    sessionManager.getSessionServiceById.mockImplementation(() => {
      throw new Error('Session not found: missing');
    });

    await agent.handle('hello', 'origin-1', { sessionId: 'missing' });

    expect(sessionManager.getSessionServiceById).toHaveBeenCalledWith('missing');
    expect(sessionManager.getSessionService).toHaveBeenCalledWith('origin-1');
  });

  it('uses the current session id when session rotates', async () => {
    const { agent, deps, sessionService } = makeAgent('tui', 'session-1');
    sessionService.getSession.mockReturnValue({ id: 'session-2' });

    await agent.handle('question', 'origin-1');
    await vi.waitFor(() => {
      expect(deps.conversationWorker.run).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-2' }),
      );
    });
  });

  it('persists conversation history in the background', async () => {
    const { agent, deps } = makeAgent();

    await agent.handle('question', 'origin-1');
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

    await agent.handle('question', 'origin-1');
    await vi.waitFor(() => {
      expect(deps.summarizerWorker.handler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          ask: 'question',
          answer: 'assistant reply',
          channel: 'tui',
          memoryService: deps.memoryService,
        }),
      );
    });
  });

  it('does not trigger the summarizer when disabled in config', async () => {
    applyTestConfigDefaults({ summarizerEnabled: false });

    const { agent, deps } = makeAgent();
    await agent.handle('question', 'origin-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deps.summarizerWorker.handler).not.toHaveBeenCalled();
  });

  it('logs when background summarizer processing fails', async () => {
    const { agent, logger, deps } = makeAgent();
    deps.summarizerWorker.handler.mockRejectedValue(new Error('summarizer down'));

    await agent.handle('question', 'origin-1');
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Background summarizer failed',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });

  it('coerces non-string input before processing', async () => {
    const { agent, deps } = makeAgent();

    await agent.handle(null as unknown as string, 'origin-1');

    expect(deps.manager.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: '' }),
    );
  });

  it('logs when background conversation processing fails', async () => {
    const { agent, logger, deps } = makeAgent();
    deps.conversationWorker.run.mockRejectedValue(new Error('db down'));

    await agent.handle('question', 'origin-1');
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Background conversation processing failed',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });
});
