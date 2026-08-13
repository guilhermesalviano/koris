import { describe, it, expect, vi } from 'vitest';
import { ChatService, ChatServiceFactory } from '../../../../src/services/chat/chat-service';

vi.mock('../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn().mockReturnValue({}) },
}));
vi.mock('../../../../src/services/providers', () => ({
  getAIProvider: vi.fn().mockReturnValue({ name: 'mock', complete: vi.fn() }),
}));
vi.mock('../../../../src/repositories/prompt', () => ({
  PromptRepositoryFactory: { create: vi.fn().mockReturnValue({ build: vi.fn() }) },
}));

function makePromptRepository() {
  return {
    build: vi.fn().mockResolvedValue({ messages: [{ role: 'user', content: 'hi' }] }),
  };
}

function makeCompletionService() {
  return { complete: vi.fn() };
}

describe('ChatService.complete', () => {
  it('builds the prompt and returns the provider message response', async () => {
    const promptRepository = makePromptRepository();
    const completionService = makeCompletionService();
    completionService.complete.mockResolvedValue({
      kind: 'message',
      text: 'hello back',
      finishReason: 'stop',
    });
    const service = new ChatService(completionService as never, promptRepository as never);

    const response = await service.complete('hello', 'tui', { toolsEnabled: true }, [], 'sess-1');

    expect(promptRepository.build).toHaveBeenCalledWith({
      userMessage: 'hello',
      channel: 'tui',
      toolsEnabled: true,
      messageHistory: [],
      sessionId: 'sess-1',
    });
    expect(completionService.complete).toHaveBeenCalledWith(
      { messages: [{ role: 'user', content: 'hi' }] },
      { signal: undefined, audit: { channel: 'tui', sessionId: 'sess-1', runId: undefined } },
    );
    expect(response).toEqual({ kind: 'message', text: 'hello back', finishReason: 'stop' });
  });

  it('maps message history to role/content only', async () => {
    const promptRepository = makePromptRepository();
    const completionService = makeCompletionService();
    completionService.complete.mockResolvedValue({ kind: 'message', text: 'ok', finishReason: 'stop' });
    const service = new ChatService(completionService as never, promptRepository as never);
    const history = [{ role: 'user', content: 'a', extra: 1 }];

    await service.complete('hi', 'tui', undefined, history as never);

    expect(promptRepository.build).toHaveBeenCalledWith(
      expect.objectContaining({ messageHistory: [{ role: 'user', content: 'a' }] }),
    );
  });

  it('rethrows provider errors instead of returning a fallback message', async () => {
    const completionService = makeCompletionService();
    completionService.complete.mockRejectedValue(new Error('provider down'));
    const service = new ChatService(completionService as never, makePromptRepository() as never);

    await expect(service.complete('hello', 'tui')).rejects.toThrow('provider down');
  });

  it('rethrows abort errors instead of returning a fallback', async () => {
    const completionService = makeCompletionService();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    completionService.complete.mockRejectedValue(abortError);
    const service = new ChatService(completionService as never, makePromptRepository() as never);
    const controller = new AbortController();

    await expect(service.complete('hi', 'tui', { signal: controller.signal })).rejects.toThrow('aborted');
    expect(completionService.complete).toHaveBeenCalledWith(
      expect.anything(),
      { signal: controller.signal, audit: { channel: 'tui', sessionId: undefined, runId: undefined } },
    );
  });

  it('rethrows when the signal is already aborted even for non-abort errors', async () => {
    const completionService = makeCompletionService();
    completionService.complete.mockRejectedValue(new Error('provider down'));
    const service = new ChatService(completionService as never, makePromptRepository() as never);
    const controller = new AbortController();
    controller.abort();

    await expect(service.complete('hi', 'tui', { signal: controller.signal })).rejects.toThrow('provider down');
  });

  it('factory create returns a ChatService', () => {
    expect(ChatServiceFactory.create({} as never)).toBeInstanceOf(ChatService);
  });
});

describe('ChatService.handler', () => {
  it('returns the text for message responses', async () => {
    const completionService = makeCompletionService();
    completionService.complete.mockResolvedValue({ kind: 'message', text: 'plain reply', finishReason: 'stop' });
    const service = new ChatService(completionService as never, makePromptRepository() as never);

    const result = await service.handler('hi', 'tui');

    expect(result).toBe('plain reply');
  });

  it('serializes tool-call responses as JSON', async () => {
    const completionService = makeCompletionService();
    completionService.complete.mockResolvedValue({
      kind: 'tool_calls',
      calls: [{ name: 'get_weather', arguments: { city: 'SP' } }],
      finishReason: 'tool_calls',
    });
    const service = new ChatService(completionService as never, makePromptRepository() as never);

    const result = await service.handler('hi', 'tui');

    expect(JSON.parse(result as string)).toEqual({
      tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'SP' } } }],
    });
  });
});
