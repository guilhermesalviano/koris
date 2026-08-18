import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageGateway } from '../../../../src/services/agents/message-gateway';
import { applyTestConfigDefaults } from '../../../helpers/test-config';
import type { ILogger } from '../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeDeps() {
  const sessionService = { getSession: vi.fn().mockReturnValue({ id: 'session-1' }) };
  const messageService = { getHistory: vi.fn(), getSessionId: vi.fn().mockReturnValue('session-1'), save: vi.fn() };
  const memoryService = { upsert: vi.fn() };

  return {
    sessionContextFactory: {
      resolve: vi.fn().mockReturnValue({ sessionService, messageService, memoryService }),
    },
    backgroundDispatcher: {
      persistConversation: vi.fn(),
      summarizeConversation: vi.fn(),
    },
    mainAgent: { run: vi.fn().mockResolvedValue('assistant reply') },
    channelService: { record: vi.fn() },
    sessionService,
    messageService,
    memoryService,
  };
}

function makeGateway(channel = 'tui') {
  const logger = makeLogger();
  const deps = makeDeps();

  const gateway = new MessageGateway(
    logger,
    channel,
    deps.sessionContextFactory as never,
    deps.backgroundDispatcher as never,
    deps.mainAgent as never,
    deps.channelService as never,
  );

  return { gateway, logger, deps };
}

describe('MessageGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyTestConfigDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles slash commands without calling the main agent', async () => {
    const { gateway, deps } = makeGateway();

    const result = await gateway.handle('/help', 'origin-1');

    expect(deps.mainAgent.run).not.toHaveBeenCalled();
    expect(result).toContain('/help');
    expect(deps.backgroundDispatcher.persistConversation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      ask: '/help',
      answer: expect.stringContaining('/help'),
      channel: 'tui',
    });
    expect(deps.backgroundDispatcher.summarizeConversation).not.toHaveBeenCalled();
  });

  it('delegates regular messages to the main agent', async () => {
    const { gateway, deps } = makeGateway('web');

    const result = await gateway.handle('hello there', 'origin-1');

    expect(deps.mainAgent.run).toHaveBeenCalledWith({
      userMessage: 'hello there',
      channel: 'web',
      message: deps.messageService,
      options: { runId: expect.any(String) },
    });
    expect(result).toBe('assistant reply');
  });

  it('passes process options through to the main agent', async () => {
    const { gateway, deps } = makeGateway();
    const onProgress = vi.fn();
    const controller = new AbortController();

    await gateway.handle('run task', 'origin-1', { onProgress, signal: controller.signal, toolsEnabled: true });

    expect(deps.mainAgent.run).toHaveBeenCalledWith({
      userMessage: 'run task',
      channel: 'tui',
      message: deps.messageService,
      options: { onProgress, signal: controller.signal, toolsEnabled: true, runId: expect.any(String) },
    });
  });

  it('persists and summarizes after a main-agent response', async () => {
    const { gateway, deps } = makeGateway();

    await gateway.handle('question', 'origin-1');

    expect(deps.backgroundDispatcher.persistConversation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      ask: 'question',
      answer: 'assistant reply',
      channel: 'tui',
    });
    expect(deps.backgroundDispatcher.summarizeConversation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      ask: 'question',
      answer: 'assistant reply',
      channel: 'tui',
      memoryService: deps.memoryService,
    });
  });

  it('persists under the current session id when the session rotates', async () => {
    const { gateway, deps } = makeGateway();
    deps.messageService.getSessionId.mockReturnValue('session-2');

    await gateway.handle('question', 'origin-1');

    expect(deps.backgroundDispatcher.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-2' }),
    );
  });

  it('resolves session context with the provided origin and session id', async () => {
    const { gateway, deps } = makeGateway();

    await gateway.handle('hello', 'origin-1', { sessionId: 'session-by-id' });

    expect(deps.sessionContextFactory.resolve).toHaveBeenCalledWith('origin-1', 'session-by-id');
  });

  it('coerces non-string input before processing', async () => {
    const { gateway, deps } = makeGateway();

    await gateway.handle(null as unknown as string, 'origin-1');

    expect(deps.mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: '' }),
    );
  });

  it('forwards images to the main agent and persists them', async () => {
    const { gateway, deps } = makeGateway();
    const images = [{ data: 'aGVsbG8=', mimeType: 'image/png' }];

    await gateway.handle({ text: 'describe this', images }, 'origin-1');

    expect(deps.mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: 'describe this', images }),
    );
    expect(deps.backgroundDispatcher.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({ ask: 'describe this', askImages: images }),
    );
  });

  it('handles plain string input without images', async () => {
    const { gateway, deps } = makeGateway();

    await gateway.handle('hello', 'origin-1');

    expect(deps.mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: 'hello', images: undefined }),
    );
  });

  it('records the channel and origin target via the channel service', async () => {
    const { gateway, deps } = makeGateway('web');

    await gateway.handle('hello', 'origin-1', { channel: 'telegram' });

    expect(deps.channelService.record).toHaveBeenCalledWith('telegram', 'origin-1');
  });

  it('records the runtime channel when no channel option is provided', async () => {
    const { gateway, deps } = makeGateway('tui');

    await gateway.handle('hello', 'origin-1');

    expect(deps.channelService.record).toHaveBeenCalledWith('tui', 'origin-1');
  });
});
