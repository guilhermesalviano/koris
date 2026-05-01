import { describe, it, expect, vi } from 'vitest';
import { ConversationWorkerFactory } from '../../../../src/services/workers/conversation-worker';
import type { ILogger } from '../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeMessageService() {
  return { save: vi.fn(), getHistory: vi.fn() };
}

describe('ConversationWorker', () => {
  it('saves user message with correct role and content', async () => {
    const messageSvc = makeMessageService();
    const worker = ConversationWorkerFactory.create(messageSvc as any);

    await worker.run({ sessionId: 's1', ask: 'hello', answer: 'hi', logger: makeLogger(), channel: 'tui' });

    expect(messageSvc.save).toHaveBeenCalledWith({ role: 'user', content: 'hello' });
  });

  it('saves assistant message with correct role and content', async () => {
    const messageSvc = makeMessageService();
    const worker = ConversationWorkerFactory.create(messageSvc as any);

    await worker.run({ sessionId: 's1', ask: 'hello', answer: 'hi', logger: makeLogger(), channel: 'tui' });

    expect(messageSvc.save).toHaveBeenCalledWith({ role: 'assistant', content: 'hi' });
  });

  it('calls save exactly twice (user + assistant)', async () => {
    const messageSvc = makeMessageService();
    const worker = ConversationWorkerFactory.create(messageSvc as any);

    await worker.run({ sessionId: 's1', ask: 'q', answer: 'a', logger: makeLogger(), channel: 'web' });

    expect(messageSvc.save).toHaveBeenCalledTimes(2);
  });

  it('does not throw when save throws', async () => {
    const messageSvc = makeMessageService();
    messageSvc.save.mockImplementationOnce(() => { throw new Error('db error'); });
    const worker = ConversationWorkerFactory.create(messageSvc as any);

    await expect(
      worker.run({ sessionId: 's1', ask: 'q', answer: 'a', logger: makeLogger(), channel: 'web' })
    ).resolves.toBeUndefined();
  });

  it('logs an error when save fails', async () => {
    const messageSvc = makeMessageService();
    messageSvc.save.mockImplementationOnce(() => { throw new Error('db error'); });
    const logger = makeLogger();
    const worker = ConversationWorkerFactory.create(messageSvc as any);

    await worker.run({ sessionId: 's1', ask: 'q', answer: 'a', logger, channel: 'web' });

    expect(logger.error).toHaveBeenCalled();
  });

  it('has name "conversationWorker"', () => {
    const worker = ConversationWorkerFactory.create(makeMessageService() as any);
    expect((worker as any).name).toBe('conversationWorker');
  });
});
