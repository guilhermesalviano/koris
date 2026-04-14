import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAIProvider } from '../../../../src/services/providers/ollama';
import { LoggerFactory } from '../../../../src/infrastructure/logger';

describe('OllamaAIProvider', () => {
  const originalFetch = globalThis.fetch;
  const logger = LoggerFactory.create();

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

    const provider = new OllamaAIProvider(logger, { baseUrl: 'http://localhost:11434', model: 'test' });

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

    const provider = new OllamaAIProvider(logger, { baseUrl: 'http://localhost:11434', model: 'test' });

    const out = await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(out).toBe('Hello');
  });

  it('forwards tools to Ollama chat payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { role: 'assistant', content: 'ok' },
            done: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      ) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;
    const provider = new OllamaAIProvider(logger, { baseUrl: 'http://localhost:11434', model: 'test' });

    await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search files',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    });

    const fetchArgs = (fetchMock as any).mock.calls[0]?.[1];
    const body = typeof fetchArgs?.body === 'string' ? JSON.parse(fetchArgs.body) : undefined;
    expect(body?.tools).toBeDefined();
    expect(body?.tools[0]?.function?.name).toBe('search');
  });
});
