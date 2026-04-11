import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAIProvider } from '../../../src/ai/providers/ollama';

describe('OllamaAIProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
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

    global.fetch = vi
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

    global.fetch = vi
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
});
