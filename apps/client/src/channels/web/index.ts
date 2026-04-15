import express, { type Request, type Response, type Application } from 'express';
import { healthCheck } from '../../services/health';
import { handle } from '../../services/agents/handler';
import { ILogger } from '../../infrastructure/logger';
import { config } from '../../config';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface WebServerOptions {
  logger: ILogger;
  sessionId: string;
}

function createApp(options: WebServerOptions): Application {
  const { logger, sessionId } = options;
  const app = express();

  app.use(express.json());

  const publicDir = path.resolve(config.BASE_DIR, './public');
  app.use(express.static(publicDir));

  app.get('/', serveIndexHandler(publicDir));
  app.post('/api/chat', createChatHandler(logger, sessionId));
  app.get('/health', createHealthHandler(logger));

  return app;
}

function serveIndexHandler(publicDir: string) {
  return (_: Request, res: Response) => {
    res.sendFile(path.join(publicDir, '/chat/index.html'));
  };
}

function createHealthHandler(logger: ILogger) {
  return async (_: Request, res: Response) => {
    const { status, timestamp, details } = await healthCheck({ logger });
    res.status((status === 'ok' ? 200 : 500)).json({ status, timestamp, details });
  };
}

function createChatHandler(logger: ILogger, sessionId: string) {
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
      const result = await handle(logger, message, 'web', sessionId, { 
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

async function startWebServer(logger: ILogger): Promise<void> {
  const sessionId = randomUUID();
  const app = createApp({ logger, sessionId });

  app.listen(config.PORT, () => {
    logger.info(`Server running at http://localhost:${config.PORT}`);
  });
}

export { createApp, startWebServer, createChatHandler, createHealthHandler, serveIndexHandler };
