import express, { type Request, type Response, type Application } from 'express';
import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './tui/interface';
import { LoggerFactory } from './infrastructure/logger';
import { config } from './config';
import { handleMessage } from './telegram/handlers';

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
