import { initBot } from '../../telegram-bot/bot';
import { startTUI } from './tui/interface';
import { LoggerFactory } from './infrastructure/logger';

const logger = LoggerFactory.create();

logger.log("info", "🚀 Starting opencrawdio...\n");

const tuiMode = process.argv.includes('tui') || process.argv.includes('--tui');

if (tuiMode) {
  logger.log("info", "Mode: TUI\n");
  startTUI();
} else {
  logger.log("info", "Mode: Telegram Bot\n");
  const bot = initBot();
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