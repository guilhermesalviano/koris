import { describe, expect, it, vi } from 'vitest';
import { AICompletionService, AIServiceError } from '../../../src/services/ai-completion-service';
import type { AIProvider, AIResponse } from '../../../src/types/chat';
import type { ILogger } from '../../../src/infrastructure/logger';

const logger: ILogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

function providerWith(complete: AIProvider['complete']): AIProvider {
  return {
    name: 'test',
    complete,
    chat: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
  } as AIProvider;
}

function makeService(complete: AIProvider['complete'], options?: { role?: 'manager' | 'worker'; agentName?: string }) {
  const auditService = { record: vi.fn() };
  const service = new AICompletionService(providerWith(complete), logger, {
    role: options?.role,
    agentName: options?.agentName,
    auditService,
  });
  return { service, auditService };
}

describe('AICompletionService', () => {
  const request = { messages: [{ role: 'user' as const, content: 'hello' }] };

  it('returns the typed provider response unchanged', async () => {
    const expected: AIResponse = { kind: 'message', text: 'world', finishReason: 'stop' };
    const complete = vi.fn().mockResolvedValue(expected);
    const { service } = makeService(complete);

    await expect(service.complete(request)).resolves.toBe(expected);
    expect(complete).toHaveBeenCalledWith(request, undefined);
  });

  it('preserves typed tool calls', async () => {
    const expected: AIResponse = {
      kind: 'tool_calls',
      calls: [{ name: 'weather', arguments: { city: 'Recife' } }],
      finishReason: 'tool_calls',
    };
    const { service } = makeService(vi.fn().mockResolvedValue(expected));

    await expect(service.complete(request)).resolves.toEqual(expected);
  });

  it('records a successful LLM audit entry', async () => {
    const expected: AIResponse = { kind: 'message', text: 'world', finishReason: 'stop' };
    const { service, auditService } = makeService(vi.fn().mockResolvedValue(expected));

    await service.complete(request, { audit: { runId: 'r1', sessionId: 's1', channel: 'web' } });

    expect(auditService.record).toHaveBeenCalledTimes(1);
    const entry = auditService.record.mock.calls[0][0];
    expect(entry).toMatchObject({
      kind: 'llm',
      role: 'manager',
      provider: 'test',
      runId: 'r1',
      sessionId: 's1',
      channel: 'web',
      prompt: JSON.stringify(request.messages),
      promptLength: JSON.stringify(request.messages).length,
      response: 'world',
      responseLength: 5,
      finishReason: 'stop',
      toolCalls: 0,
      status: 'success',
    });
    expect(typeof entry.id).toBe('string');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records tool-call counts in the audit entry', async () => {
    const expected: AIResponse = {
      kind: 'tool_calls',
      calls: [{ name: 'weather', arguments: { city: 'Recife' } }, { name: 'search', arguments: { q: 'x' } }],
      finishReason: 'tool_calls',
    };
    const { service, auditService } = makeService(vi.fn().mockResolvedValue(expected));

    await service.complete(request);

    const entry = auditService.record.mock.calls[0][0];
    expect(entry.toolCalls).toBe(2);
    expect(entry.response).toBe(JSON.stringify(expected.calls));
  });

  it('records an error audit entry with the mapped error code', async () => {
    const { service, auditService } = makeService(vi.fn().mockRejectedValue(new Error('HTTP 429 rate limit')));

    await expect(service.complete(request)).rejects.toMatchObject({ code: 'rate_limited' });

    const entry = auditService.record.mock.calls[0][0];
    expect(entry).toMatchObject({
      kind: 'llm',
      status: 'error',
      errorCode: 'rate_limited',
      errorMessage: expect.stringContaining('so many requests'),
    });
  });

  it.each([
    ['request timed out', 'timeout'],
    ['HTTP 401 authentication failed', 'authentication'],
    ['HTTP 429 rate limit', 'rate_limited'],
    ['response missing content', 'malformed_response'],
    ['fetch failed', 'unavailable'],
  ] as const)('maps %s to %s', async (message, code) => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error(message)));

    await expect(service.complete(request)).rejects.toMatchObject({ code });
  });

  it('maps a provider HTTP status to its friendly message', async () => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('NVIDIA /chat/completions failed (429): {"error":"rate limit"}')));

    await expect(service.complete(request)).rejects.toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
    });
    await expect(service.complete(request)).rejects.toThrow(/so many requests/i);
  });

  it.each([
    [401, 'authentication', /API key/i],
    [403, 'authentication', /permission/i],
    [408, 'timeout', /bit too long/i],
    [500, 'unavailable', /went wrong on the server/i],
    [503, 'unavailable', /quick nap/i],
    [504, 'timeout', /too long to reply/i],
  ] as const)('maps status %s to %s with a friendly message', async (status, code, messagePattern) => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error(`Ollama /api/chat failed (${status}): raw body`)));

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(err).toMatchObject({ code, statusCode: status });
    expect((err as Error).message).toMatch(messagePattern);
  });

  it('keeps the raw provider message and status when the status has no mapping', async () => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('Ollama /api/chat failed (418): I am a teapot')));

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'unknown', statusCode: 418 });
    expect((err as Error).message).toBe('Ollama /api/chat failed (418): I am a teapot');
  });

  it('serializes an AIServiceError into a structured JSON payload', async () => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('Ollama /api/chat failed (429): nope')));

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      code: 'rate_limited',
      statusCode: 429,
      message: expect.stringMatching(/so many requests/i),
    });
  });

  it('maps an aborted signal to an aborted error', async () => {
    const controller = new AbortController();
    controller.abort();
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('cancelled')));

    await expect(service.complete(request, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted' });
  });

  it('does not wrap an existing AIServiceError', async () => {
    const original = new AIServiceError('unavailable', 'offline');
    const { service } = makeService(vi.fn().mockRejectedValue(original));

    await expect(service.complete(request)).rejects.toBe(original);
  });
});
