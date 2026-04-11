import express, { type Request, type Response, type Application } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './tui/interface';
import { LoggerFactory } from './infrastructure/logger';
import { config } from './config';
import { handleMessage } from './telegram/handlers';
import { processUserMessage } from './agent/processor';

const logger = LoggerFactory.create();

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

function startCliMode(): void {
  logger.log("info", "🚀 Starting opencrawdio...\n");

  const tuiMode = hasFlag("tui");
  const telegramMode = hasFlag("telegram");

  if (tuiMode) {
    logger.log("info", "Mode: TUI\n");
    startTUI();
    return;
  }

  if (telegramMode) {
    logger.log("info", "Mode: Telegram Bot\n");
    const bot = initBot({
      token: config.TELEGRAM.BOT_TOKEN,
      polling: true,
      onMessage: handleMessage,
    });
    logger.log("info", "✅ Bot is ready! Send a message to your bot on Telegram.\n");
    logger.log("info", "💡 Tip: Run with 'tui' flag to use TUI mode instead.\n");

    process.on("SIGINT", () => {
      logger.log("info", "\n👋 Shutting down gracefully...");
      bot.stopPolling();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.log("info", "\n👋 Shutting down gracefully...");
      bot.stopPolling();
      process.exit(0);
    });
  }
}

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

if (require.main === module) {
  startCliMode();
}

export { app, logger }
