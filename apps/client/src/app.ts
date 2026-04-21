import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './channels/tui';
import { startWebServer } from './channels/web';
import { LoggerFactory } from './infrastructure/logger';
import { handleMessage } from './channels/telegram';
import { config } from './config';
import { AgentHandlerFactory } from './services/agents/handler';

const logger = LoggerFactory.create();

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

function startCliMode(): void {
  logger.info("🚀 Starting koris-agent...\n");

  const tuiMode = hasFlag("tui");
  const telegramMode = hasFlag("telegram");
  const webMode = hasFlag("web") || (!tuiMode && !telegramMode);

  if (!tuiMode && !telegramMode && !webMode) {
    logger.error("No mode provided.");
    logger.error("Usage: pnpm --filter koris-agent run dev:tui | pnpm --filter koris-agent run dev:telegram | pnpm --filter koris-agent run dev");
    process.exit(1);
  }

  if (tuiMode) {
    logger.info("Mode: TUI\n");
    startTUI({ logger });
  }

  if (telegramMode) {
    logger.info("Mode: Telegram Bot\n");
    const handler = AgentHandlerFactory.create(logger, 'telegram');

    const bot = initBot({
      token: config.TELEGRAM.BOT_TOKEN,
      polling: true,
      onMessage: (msg) => handleMessage(handler, msg),
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

  if (webMode) {
    logger.info("Mode: Web Server\n");
    startWebServer(logger).catch((error) => {
      logger.error("Failed to start web server:", error);
      process.exit(1);
    });
  }
}

if (require.main === module) {
  startCliMode();
}
