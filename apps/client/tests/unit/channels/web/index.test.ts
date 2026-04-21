import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

type Handler = (req: Request, res: Response) => void;

interface MockResponse {
  sendFile: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

async function loadServeIndexHandler(): Promise<(publicDir: string) => Handler> {
  vi.resetModules();
  const mod = await import('../../../../src/channels/web');
  return mod.serveIndexHandler;
}

function makeRequest(ip: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
  } as Request;
}

function makeResponse(): Response & MockResponse {
  const res = {
    sendFile: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & MockResponse;

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe('serveIndexHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves index.html when request is within the rate limit', async () => {
    const serveIndexHandler = await loadServeIndexHandler();
    const handler = serveIndexHandler('/tmp/public');

    const req = makeRequest('127.0.0.1');
    const res = makeResponse();

    handler(req, res);

    expect(res.sendFile).toHaveBeenCalledTimes(1);
    expect(res.sendFile.mock.calls[0][0]).toContain('/chat/index.html');
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('returns 429 after exceeding per-IP index rate limit window', async () => {
    const serveIndexHandler = await loadServeIndexHandler();
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
    const serveIndexHandler = await loadServeIndexHandler();
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
