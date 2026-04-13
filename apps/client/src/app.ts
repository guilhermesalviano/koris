import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './channels/tui';
import { LoggerFactory } from './infrastructure/logger';
import { handleMessage } from './channels/telegram';
import { config } from './config';

const logger = LoggerFactory.create();

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

function startCliMode(): void {
  logger.info("🚀 Starting opencrawdio...\n");

  const tuiMode = hasFlag("tui");
  const telegramMode = hasFlag("telegram");

  if (!tuiMode && !telegramMode) {
    logger.error("No mode provided.");
    logger.error("Usage: pnpm --filter opencrawdio run tui | pnpm --filter opencrawdio run telegram");
    process.exit(1);
  }

  if (tuiMode) {
    logger.info("Mode: TUI\n");
    startTUI({ logger });
  }

  if (telegramMode) {
    logger.info("Mode: Telegram Bot\n");
    const bot = initBot({
      token: config.TELEGRAM.BOT_TOKEN,
      polling: true,
      onMessage: (msg) => handleMessage(logger, msg),
    });
    logger.info("✅ Bot is ready! Send a message to your bot on Telegram.\n");

    process.on("SIGINT", () => {
      logger.info("\n👋 Shutting down gracefully...");
      bot.stopPolling();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      logger.info("\n👋 Shutting down gracefully...");
      bot.stopPolling();
      process.exit(0);
    });
  }
}

if (require.main === module) {
  startCliMode();
}

export { logger }
