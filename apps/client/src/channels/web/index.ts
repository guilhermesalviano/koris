import express, { type Request, type Response, type Application } from 'express';
import { healthCheck } from '../../agents/health';
import { handle } from '../../agents/handler';
import { LoggerFactory } from '../../infrastructure/logger';
import { config } from '../../config';
import path from 'node:path';

const logger = LoggerFactory.create();

const app: Application = express()

app.use(express.json())

const publicDir = path.resolve(config.BASE_DIR, './public');

app.use(express.static(publicDir));

app.get('/', (_: Request, res: Response) => {
  res.sendFile(path.join(publicDir, '/chat/index.html'));
});

app.post('/api/chat', async (req: Request, res: Response) => {
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

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const result = await handle(logger, message, 'tui', { 
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

    // Handle always returns a string now
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
});

app.get('/health', async (_: Request, res: Response) => {
  const { status, timestamp, details } = await healthCheck({ logger });
  res.status((status === 'ok' ? 200 : 500)).json({ status, timestamp, details });
});

app.listen(config.PORT, () => {
  logger.info(`Server running at http://localhost:${config.PORT}`);
});
