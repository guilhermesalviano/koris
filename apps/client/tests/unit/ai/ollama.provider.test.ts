import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAIProvider } from '../../../src/ai/providers/ollama';

describe('OllamaAIProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('accumulates streamed NDJSON message.content chunks from /api/chat', async () => {
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

    const out = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(out).toBe('Hello');
  });
});
