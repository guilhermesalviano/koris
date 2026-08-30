import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ILogger } from '../../../src/infrastructure/logger';
import type { IMessageGateway } from '../../../src/services/agents/message-gateway';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../src/constants/thinking';

type Handler = (req: Request, res: Response) => void;
type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const {
  mockHealthCheck,
  mockAgentHandle,
} = vi.hoisted(() => ({
  mockHealthCheck: vi.fn(),
  mockAgentHandle: vi.fn(),
}));

vi.mock('../../../src/services/provider-health-service', () => ({
  healthCheck: mockHealthCheck,
}));

interface MockResponse {
  sendFile: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

async function loadWebModule(): Promise<typeof import('../../../src/dashboard')> {
  vi.resetModules();
  return import('../../../src/dashboard');
}

function makeRequest(ip: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    body: {},
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

function makeResponse(): Response & MockResponse {
  const res = {
    sendFile: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    writableEnded: false,
    destroyed: false,
  } as unknown as Response & MockResponse;

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe('serveIndexHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHealthCheck.mockReset();
    mockAgentHandle.mockReset();
  });

  it('serves index.html when request is within the rate limit', async () => {
    const { serveIndexHandler } = await loadWebModule();
    const handler = serveIndexHandler('/tmp/public');

    const req = makeRequest('127.0.0.1');
    const res = makeResponse();

    handler(req, res);

    expect(res.sendFile).toHaveBeenCalledTimes(1);
    expect(res.sendFile.mock.calls[0][0]).toContain('/index.html');
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('returns 429 after exceeding per-IP index rate limit window', async () => {
    const { serveIndexHandler } = await loadWebModule();
    const handler = serveIndexHandler('/tmp/public');

    const req = makeRequest('10.0.0.1');

    for (let i = 0; i < 60; i += 1) {
      const okRes = makeResponse();
      handler(req, okRes);
      expect(okRes.sendFile).toHaveBeenCalledTimes(1);
    }

    const blockedRes = makeResponse();
    handler(req, blockedRes);

    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith({
      error: 'Too many requests to /. Please try again later.',
    });
    expect(blockedRes.sendFile).not.toHaveBeenCalled();
  });

  it('tracks rate limits independently per IP', async () => {
    const { serveIndexHandler } = await loadWebModule();
    const handler = serveIndexHandler('/tmp/public');

    const reqA = makeRequest('192.168.0.10');
    const reqB = makeRequest('192.168.0.11');

    for (let i = 0; i < 61; i += 1) {
      handler(reqA, makeResponse());
    }

    const resB = makeResponse();
    handler(reqB, resB);

    expect(resB.status).not.toHaveBeenCalledWith(429);
    expect(resB.sendFile).toHaveBeenCalledTimes(1);
  });
});

describe('createHealthHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns HTTP 200 when provider health is ok', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as ILogger;
    mockHealthCheck.mockResolvedValue({ status: 'ok', timestamp: '2026-01-01', details: 'fine' });

    const { createHealthHandler } = await loadWebModule();
    const handler = createHealthHandler(logger) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    const res = makeResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', timestamp: '2026-01-01', details: 'fine' });
  });

  it('returns HTTP 500 when provider health is not ok', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as ILogger;
    mockHealthCheck.mockResolvedValue({ status: 'error', timestamp: '2026-01-01', details: 'down' });

    const { createHealthHandler } = await loadWebModule();
    const handler = createHealthHandler(logger) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    const res = makeResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', timestamp: '2026-01-01', details: 'down' });
  });
});

describe('createChatHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentHandle.mockReset();
  });

  it('returns 400 when message is missing', async () => {
    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    const res = makeResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'message is required' });
    expect(mockAgentHandle).not.toHaveBeenCalled();
  });

  it('streams progress + final response in SSE format', async () => {
    mockAgentHandle.mockImplementation(async (_msg: string, _originId: string, options: { onProgress?: (s: string) => void }) => {
      options.onProgress?.('working');
      return 'done';
    });

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"progress"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"text":"done"'));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('filters internal stream markers from async responses before sending SSE chunks', async () => {
    mockAgentHandle.mockImplementation(async (_msg: string, _originId: string, options: { onProgress?: (s: string) => void }) => {
      options.onProgress?.('working');

      return (async function* (): AsyncGenerator<string> {
        yield THINK_START;
        yield 'internal reasoning';
        yield THINK_END;
        yield RESPONSE_ANCHOR;
        yield 'hello';
        yield ' world';
      })();
    });

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"progress"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"text":"hello"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"text":" world"'));
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('internal reasoning'));
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining(RESPONSE_ANCHOR));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('emits a structured JSON error event when the agent throws an AIServiceError', async () => {
    const { createChatHandler } = await loadWebModule();
    const { AIServiceError } = await import('../../../src/services/ai-completion-service');
    mockAgentHandle.mockRejectedValue(new AIServiceError('rate_limited', 'The AI provider is rate limited. Try again shortly.', undefined, 429));

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"code":"rate_limited"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"statusCode":429'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('rate limited'));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('emits an unknown error event for generic thrown errors', async () => {
    mockAgentHandle.mockRejectedValue(new Error('something exploded'));

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"code":"unknown"'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('something exploded'));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('keeps the agent running to completion when the client disconnects mid-request', async () => {
    mockAgentHandle.mockResolvedValue('done');

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    let closeListener: (() => void) | undefined;
    (res.on as unknown as ReturnType<typeof vi.fn>).mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') closeListener = cb;
    });

    const promise = handler(req, res);
    closeListener?.();

    await promise;

    expect(mockAgentHandle).toHaveBeenCalledTimes(1);
    // The run gets an abort signal, but a mere client disconnect must NOT abort it.
    const passedOptions = mockAgentHandle.mock.calls[0][2] as { signal?: AbortSignal };
    expect(passedOptions.signal).toBeInstanceOf(AbortSignal);
    expect(passedOptions.signal?.aborted).toBe(false);
    expect(res.write).not.toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).not.toHaveBeenCalled();
  });

  it('registers and clears the active run while a request is processing', async () => {
    let resolveAgent: (value: string) => void = () => {};
    mockAgentHandle.mockImplementation(() => new Promise((resolve) => { resolveAgent = resolve; }));

    const { createChatHandler } = await loadWebModule();
    const { activeRunsRegistry } = await import('../../../src/dashboard/active-runs');

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello', sessionId: 'sess-1' } as Request['body'];
    const res = makeResponse();

    const promise = handler(req, res);

    const runs = activeRunsRegistry.list();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sessionId: 'sess-1', question: 'hello', channel: 'web' });

    resolveAgent('done');
    await promise;

    expect(activeRunsRegistry.list()).toHaveLength(0);
  });

  it('does not register an active run without a session id', async () => {
    mockAgentHandle.mockResolvedValue('done');

    const { createChatHandler } = await loadWebModule();
    const { activeRunsRegistry } = await import('../../../src/dashboard/active-runs');

    const mockHandler = { handle: mockAgentHandle } as unknown as IMessageGateway;
    const handler = createChatHandler(mockHandler) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(activeRunsRegistry.list()).toHaveLength(0);
  });

  it('passes an abort signal into the gateway options', async () => {
    mockAgentHandle.mockResolvedValue('done');

    const { createChatHandler } = await loadWebModule();
    const handler = createChatHandler({ handle: mockAgentHandle } as unknown as IMessageGateway) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello', sessionId: 'sess-1' } as Request['body'];

    await handler(req, makeResponse());

    const options = mockAgentHandle.mock.calls[0][2] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('emits a cancelled event (not an error) when the run is aborted', async () => {
    const { createChatHandler } = await loadWebModule();
    const { AIServiceError } = await import('../../../src/services/ai-completion-service');
    mockAgentHandle.mockRejectedValue(new AIServiceError('aborted', 'request aborted'));

    const handler = createChatHandler({ handle: mockAgentHandle } as unknown as IMessageGateway) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { message: 'hello', sessionId: 'sess-1' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"cancelled"'));
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
  });
});

describe('createChatCancelHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentHandle.mockReset();
  });

  it('returns 400 when sessionId is missing', async () => {
    const { createChatCancelHandler } = await loadWebModule();
    const handler = createChatCancelHandler({ handle: mockAgentHandle } as unknown as IMessageGateway) as AsyncHandler;
    const res = makeResponse();

    await handler(makeRequest('127.0.0.1'), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('reports { cancelled: false } when no run is active for the session', async () => {
    const { createChatCancelHandler } = await loadWebModule();
    const handler = createChatCancelHandler({ handle: mockAgentHandle } as unknown as IMessageGateway) as AsyncHandler;
    const req = makeRequest('127.0.0.1');
    req.body = { sessionId: 'nope' } as Request['body'];
    const res = makeResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ cancelled: false });
  });

  it('aborts the in-flight run for a session and reports { cancelled: true }', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveAgent: (value: string) => void = () => {};
    mockAgentHandle.mockImplementation((_input: unknown, _origin: unknown, options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return new Promise<string>((resolve) => { resolveAgent = resolve; });
    });

    const { createChatHandler, createChatCancelHandler } = await loadWebModule();
    const gateway = { handle: mockAgentHandle } as unknown as IMessageGateway;
    const chat = createChatHandler(gateway) as AsyncHandler;
    const cancel = createChatCancelHandler(gateway) as AsyncHandler;

    const chatReq = makeRequest('127.0.0.1');
    chatReq.body = { message: 'hello', sessionId: 'sess-9' } as Request['body'];
    const chatPromise = chat(chatReq, makeResponse());

    expect(capturedSignal?.aborted).toBe(false);

    const cancelReq = makeRequest('127.0.0.1');
    cancelReq.body = { sessionId: 'sess-9' } as Request['body'];
    const cancelRes = makeResponse();
    await cancel(cancelReq, cancelRes);

    expect(cancelRes.json).toHaveBeenCalledWith({ cancelled: true });
    expect(capturedSignal?.aborted).toBe(true);

    resolveAgent('done');
    await chatPromise;
  });
});
