import express, { type Request, type Response, type Application } from 'express';
import { healthCheck } from '../services/provider-health-service';
import { ILogger } from '../infrastructure/logger';
import { config } from '../config';
import path from 'node:path';
import { IAgent } from '../services/main-agent/agent';

interface WebServerOptions {
  logger: ILogger;
  agent: IAgent;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const INDEX_RATE_LIMIT_WINDOW_MS = 60_000;
const INDEX_RATE_LIMIT_MAX_REQUESTS = 60;
const indexRateLimitStore = new Map<string, RateLimitEntry>();

function createApp(options: WebServerOptions): Application {
  const { logger, agent } = options;
  const app = express();

  app.use(express.json());

  const publicDir = path.resolve(config.BASE_DIR, './public');
  app.use(express.static(publicDir));

  app.get('/', serveIndexHandler(publicDir));
  app.post('/api/chat', createChatHandler(agent));
  app.get('/health', createHealthHandler(logger));

  return app;
}

function serveIndexHandler(publicDir: string) {
  return (req: Request, res: Response) => {
    const now = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = indexRateLimitStore.get(clientIp);

    if (!existing || now - existing.windowStart >= INDEX_RATE_LIMIT_WINDOW_MS) {
      indexRateLimitStore.set(clientIp, { count: 1, windowStart: now });
    } else if (existing.count >= INDEX_RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({ error: 'Too many requests to /. Please try again later.' });
      return;
    } else {
      existing.count += 1;
      indexRateLimitStore.set(clientIp, existing);
    }

    if (indexRateLimitStore.size > 5_000) {
      for (const [ip, entry] of indexRateLimitStore.entries()) {
        if (now - entry.windowStart >= INDEX_RATE_LIMIT_WINDOW_MS) {
          indexRateLimitStore.delete(ip);
        }
      }
    }

    res.sendFile(path.join(publicDir, '/chat/index.html'));
  };
}

function createHealthHandler(logger: ILogger) {
  return async (_: Request, res: Response) => {
    const { status, timestamp, details } = await healthCheck({ logger });
    res.status((status === 'ok' ? 200 : 500)).json({ status, timestamp, details });
  };
}

function createChatHandler(agent: IAgent) {
  return async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const abortController = new AbortController();
    let clientClosed = false;
    
    const onClose = () => {
      clientClosed = true;
      abortController.abort();
    };
    
    req.on('aborted', onClose);
    res.on('close', onClose);

    const writeSse = (payload: unknown) => {
      if (clientClosed || res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    setupSseHeaders(res);

    try {
      const result = await agent.handle(message, {
        signal: abortController.signal,
        onProgress: (summary: string) => {
          if (clientClosed) return;
          writeSse({
            type: 'progress',
            delta: { status: summary },
          });
        }
      });
      
      if (clientClosed) return;

      writeSse({
        type: 'content_block_delta',
        delta: { text: result },
      });

      if (clientClosed) return;
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      if (clientClosed) return;
      const msg = error instanceof Error ? error.message : String(error);
      writeSse({
        type: 'content_block_delta',
        delta: { text: `Error: ${msg}` },
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      req.off('aborted', onClose);
      res.off('close', onClose);
    }
  };
}

function setupSseHeaders(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

async function startWebServer(logger: ILogger, agent: IAgent): Promise<void> {
  const app = createApp({ logger, agent });

  app.listen(config.PORT, () => {
    logger.info(`Server running at http://localhost:${config.PORT}`);
  });
}

export { createApp, startWebServer, createChatHandler, createHealthHandler, serveIndexHandler };
