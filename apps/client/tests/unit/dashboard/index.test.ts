import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ILogger } from '../../../src/infrastructure/logger';
import type { IAgentHandler } from '../../../src/services/main-agent/handler';
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
    expect(res.sendFile.mock.calls[0][0]).toContain('/chat/index.html');
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
    const mockHandler = { handle: mockAgentHandle } as unknown as IAgentHandler;

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
    mockAgentHandle.mockImplementation(async (_msg: string, options: { onProgress?: (s: string) => void }) => {
      options.onProgress?.('working');
      return 'done';
    });

    const mockHandler = { handle: mockAgentHandle } as unknown as IAgentHandler;

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
    mockAgentHandle.mockImplementation(async (_msg: string, options: { onProgress?: (s: string) => void }) => {
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

    const mockHandler = { handle: mockAgentHandle } as unknown as IAgentHandler;

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
});
