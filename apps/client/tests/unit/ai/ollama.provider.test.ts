import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAIProvider } from '../../../src/ai/providers/ollama';

describe('OllamaAIProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('accumulates streamed NDJSON message.content chunks from /api/chat via chatStream', async () => {
    const encoder = new TextEncoder();

    const ndjson =
      JSON.stringify({ message: { role: 'assistant', content: 'Hel' }, done: false }) + '\n' +
      JSON.stringify({ message: { role: 'assistant', content: 'lo' }, done: true }) + '\n';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split across chunks to mimic real network streaming
        controller.enqueue(encoder.encode(ndjson.slice(0, 20)));
        controller.enqueue(encoder.encode(ndjson.slice(20)));
        controller.close();
      },
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        })
      ) as unknown as typeof fetch;

    const provider = new OllamaAIProvider({ baseUrl: 'http://localhost:11434', model: 'test' });

    let out = '';
    for await (const chunk of provider.chatStream({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      out += chunk;
    }

    expect(out).toBe('Hello');
  });

  it('returns full response from chat() using non-streaming fallback', async () => {
    const responseBody = JSON.stringify({
      message: { role: 'assistant', content: 'Hello' },
      done: true,
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(responseBody, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      ) as unknown as typeof fetch;

    const provider = new OllamaAIProvider({ baseUrl: 'http://localhost:11434', model: 'test' });

    const out = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(out).toBe('Hello');
  });

  it('healthCheck() returns ok with version detail on 200 /api/version', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '0.6.0' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      ) as unknown as typeof fetch;

    const provider = new OllamaAIProvider({ baseUrl: 'http://localhost:11434', model: 'test' });
    const health = await provider.healthCheck();

    expect(health).toEqual({ ok: true, detail: 'v0.6.0' });
  });

  it('healthCheck() returns HTTP detail when /api/version is non-2xx', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('service unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        })
      ) as unknown as typeof fetch;

    const provider = new OllamaAIProvider({ baseUrl: 'http://localhost:11434', model: 'test' });
    const health = await provider.healthCheck();

    expect(health).toEqual({ ok: false, detail: 'HTTP 503' });
  });

  it('healthCheck() returns error detail when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const provider = new OllamaAIProvider({ baseUrl: 'http://localhost:11434', model: 'test' });
    const health = await provider.healthCheck();

    expect(health).toEqual({ ok: false, detail: 'network down' });
  });
});
