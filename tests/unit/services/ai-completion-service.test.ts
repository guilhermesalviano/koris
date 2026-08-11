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

describe('AICompletionService', () => {
  const request = { messages: [{ role: 'user' as const, content: 'hello' }] };

  it('returns the typed provider response unchanged', async () => {
    const expected: AIResponse = { kind: 'message', text: 'world', finishReason: 'stop' };
    const complete = vi.fn().mockResolvedValue(expected);
    const service = new AICompletionService(providerWith(complete), logger);

    await expect(service.complete(request)).resolves.toBe(expected);
    expect(complete).toHaveBeenCalledWith(request, undefined);
  });

  it('preserves typed tool calls', async () => {
    const expected: AIResponse = {
      kind: 'tool_calls',
      calls: [{ name: 'weather', arguments: { city: 'Recife' } }],
      finishReason: 'tool_calls',
    };
    const service = new AICompletionService(
      providerWith(vi.fn().mockResolvedValue(expected)),
      logger,
    );

    await expect(service.complete(request)).resolves.toEqual(expected);
  });

  it.each([
    ['request timed out', 'timeout'],
    ['HTTP 401 authentication failed', 'authentication'],
    ['HTTP 429 rate limit', 'rate_limited'],
    ['response missing content', 'malformed_response'],
    ['fetch failed', 'unavailable'],
  ] as const)('maps %s to %s', async (message, code) => {
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error(message))),
      logger,
    );

    await expect(service.complete(request)).rejects.toMatchObject({ code });
  });

  it('maps a provider HTTP status to its friendly message', async () => {
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error('NVIDIA /chat/completions failed (429): {"error":"rate limit"}'))),
      logger,
    );

    await expect(service.complete(request)).rejects.toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
    });
    await expect(service.complete(request)).rejects.toThrow(/rate limited/i);
  });

  it.each([
    [401, 'authentication', /API key/i],
    [403, 'authentication', /permission/i],
    [408, 'timeout', /took too long/i],
    [500, 'unavailable', /server error/i],
    [503, 'unavailable', /unavailable/i],
    [504, 'timeout', /timed out/i],
  ] as const)('maps status %s to %s with a friendly message', async (status, code, messagePattern) => {
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error(`Ollama /api/chat failed (${status}): raw body`))),
      logger,
    );

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(err).toMatchObject({ code, statusCode: status });
    expect((err as Error).message).toMatch(messagePattern);
  });

  it('keeps the raw provider message and status when the status has no mapping', async () => {
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error('Ollama /api/chat failed (418): I am a teapot'))),
      logger,
    );

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'unknown', statusCode: 418 });
    expect((err as Error).message).toBe('Ollama /api/chat failed (418): I am a teapot');
  });

  it('serializes an AIServiceError into a structured JSON payload', async () => {
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error('Ollama /api/chat failed (429): nope'))),
      logger,
    );

    const err = await service.complete(request).catch((e: unknown) => e);
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      code: 'rate_limited',
      statusCode: 429,
      message: expect.stringMatching(/rate limited/i),
    });
  });

  it('maps an aborted signal to an aborted error', async () => {
    const controller = new AbortController();
    controller.abort();
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(new Error('cancelled'))),
      logger,
    );

    await expect(service.complete(request, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'aborted' });
  });

  it('does not wrap an existing AIServiceError', async () => {
    const original = new AIServiceError('unavailable', 'offline');
    const service = new AICompletionService(
      providerWith(vi.fn().mockRejectedValue(original)),
      logger,
    );

    await expect(service.complete(request)).rejects.toBe(original);
  });
});
