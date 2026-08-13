import { describe, it, expect, vi, afterEach } from 'vitest';
import { NvidiaAIProvider } from '../../../../../src/services/providers/nvidia';
import { config } from '../../../../../src/config';
import { LoggerFactory } from '../../../../../src/infrastructure/logger';

const logger = LoggerFactory.create();

function makeSSE(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join('') + 'data: [DONE]\n\n';

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

describe('NvidiaAIProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('accumulates streamed SSE content chunks via chatStream', async () => {
    const stream = makeSSE([
      { choices: [{ delta: { role: 'assistant', content: 'Hel' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    let out = '';
    for await (const chunk of provider.chatStream({ messages: [{ role: 'user', content: 'hi' }] })) {
      out += chunk;
    }

    expect(out).toBe('Hello');
  });

  it('returns full response from chat() non-streaming call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Hello from NVIDIA' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const out = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(out).toBe('Hello from NVIDIA');
  });

  it('forwards tools to NVIDIA chat payload with Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
      apiToken: 'nvapi-secret',
    });

    await provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          type: 'function',
          function: { name: 'search', description: 'Search files', parameters: { type: 'object', properties: {} } },
        },
      ],
    });

    const fetchArgs = (fetchMock as any).mock.calls[0]?.[1];
    const body = JSON.parse(fetchArgs.body);
    const headers = new Headers(fetchArgs.headers);

    expect(body.tools).toBeDefined();
    expect(body.tools[0]?.function?.name).toBe('search');
    expect(headers.get('authorization')).toBe('Bearer nvapi-secret');
  });

  it('returns serialized tool_calls JSON when chat response contains tool calls', async () => {
    const toolCalls = [
      { id: 'call_1', type: 'function', function: { name: 'get_skill', arguments: '{"skill_name":"git"}' } },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: null, tool_calls: toolCalls }, finish_reason: 'tool_calls' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const out = await provider.chat({ messages: [{ role: 'user', content: 'use a skill' }] });
    const parsed = JSON.parse(out);
    expect(parsed.tool_calls[0].function.name).toBe('get_skill');
  });

  it('accumulates streamed tool calls across SSE chunks via chatStream', async () => {
    const stream = makeSSE([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_skill', arguments: '' } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"skill_name":"git"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    let out = '';
    for await (const chunk of provider.chatStream({ messages: [{ role: 'user', content: 'use a skill' }] })) {
      out += chunk;
    }

    const parsed = JSON.parse(out);
    expect(parsed.tool_calls[0].function.name).toBe('get_skill');
    expect(parsed.tool_calls[0].function.arguments).toBe('{"skill_name":"git"}');
  });

  it('wraps reasoning_content in THINK markers during streaming', async () => {
    const { THINK_START, THINK_END } = await import('../../../../../src/constants/thinking');

    const stream = makeSSE([
      { choices: [{ delta: { reasoning_content: 'let me think...' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.chatStream({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toBe(THINK_START);
    expect(chunks[1]).toBe('let me think...');
    expect(chunks[2]).toBe(THINK_END);
    expect(chunks[3]).toBe('Answer');
  });

  it('healthCheck returns ok: true when /models returns 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const result = await provider.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('healthCheck returns ok: false on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const result = await provider.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.detail).toBe('HTTP 401');
  });

  it('arms idle timeout before first stream chunk', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    globalThis.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener(
            'abort',
            () => controller.error(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'test-model',
    });

    const outer = new AbortController();
    const iterator = provider.chatStream(
      { messages: [{ role: 'user', content: 'hi' }] },
      { signal: outer.signal },
    );

    const nextChunk = iterator.next();
    await Promise.resolve();
    await Promise.resolve();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), config.AI.TIMEOUTS.HARD_MS);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), config.AI.TIMEOUTS.IDLE_MS);

    outer.abort();
    await expect(nextChunk).rejects.toThrow('NVIDIA request aborted');
  });

  it('throws a helpful error when model is missing namespace prefix (404 page not found)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('404 page not found', { status: 404 }),
    ) as unknown as typeof fetch;

    const provider = new NvidiaAIProvider(logger, {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'gemma-4-31b-it', // missing "google/" prefix
    });

    await expect(
      provider.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('namespace prefix');
  });

  it('uses default NVIDIA base URL and model from config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const provider = new NvidiaAIProvider(logger);
    expect(provider.name).toBe('nvidia');

    await provider.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const calledUrl = (fetchMock as any).mock.calls[0]?.[0];
    const fetchArgs = (fetchMock as any).mock.calls[0]?.[1];
    const body = JSON.parse(fetchArgs.body);

    expect(calledUrl).toBe(`${config.AI.MANAGER.BASE_URL.replace(/\/+$/, '')}/chat/completions`);
    expect(body.model).toBe(config.AI.MANAGER.MODEL);
  });
});
