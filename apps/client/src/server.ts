import express, { type Request, type Response, type Application } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config'
import { logger } from './app'
import { processUserMessage } from './agent/processor';

const app: Application = express()

app.use(express.json())

const publicDirCandidates = [
  path.resolve(config.BASE_DIR, 'public'),
  path.resolve(config.BASE_DIR, 'apps/client/public'),
];

const publicDir = publicDirCandidates.find((candidate) => fs.existsSync(candidate));

if (publicDir) {
  app.use('/public', express.static(publicDir));

  app.get('/', (_: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.post('/api/chat', async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const writeSse = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const result = await processUserMessage(message, 'tui');

    if (typeof result !== 'string') {
      for await (const chunk of result) {
        if (!chunk) continue;
        writeSse({
          type: 'content_block_delta',
          delta: { text: chunk },
        });
      }
    } else {
      writeSse({
        type: 'content_block_delta',
        delta: { text: result },
      });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    writeSse({
      type: 'content_block_delta',
      delta: { text: `Error: ${msg}` },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('/health', (_: Request, res: Response) => {
  res.status(200).json({ 
    message: 'OK',
    timestamp: new Date().toISOString()
  })
})

app.listen(config.PORT, () => {
  logger.log('info', `Server running at http://localhost:${config.PORT}`)
})