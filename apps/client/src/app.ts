// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './channels/tui';
import { startWebServer } from './channels/web';
import { LoggerFactory } from './infrastructure/logger';
import { handleMessage } from './channels/telegram';
import { config } from './config';
import { AgentHandlerFactory } from './services/agents/handler';
import { heartbeat } from './services/agents/heartbeat';

const logger = LoggerFactory.create();
const handler = AgentHandlerFactory.create(logger, 'tui');

// tests
const date = new Date();
heartbeat({ logger, handler, date }).catch((error) => {
  logger.error('Initial heartbeat failed:', error);
});

setInterval(async () => {
  const date = new Date();
  logger.info(`[${date.toISOString()}] Agent waking up...`);

  try {
    if (config.HEARTBEAT.ENABLED) {
      await heartbeat({ logger, handler, date });
    }
  } catch (error: any) {
    logger.error('Agent failed:', error);
  }
}, config.HEARTBEAT.INTERVAL_MS);


function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

function startCliMode(): void {
  const tuiMode = hasFlag("tui");
  const telegramMode = hasFlag("telegram");
  const webMode = hasFlag("web") || (!tuiMode && !telegramMode);

  if (!tuiMode && !telegramMode && !webMode) {
    logger.error("No mode provided.");
    logger.error("Usage: pnpm --filter koris-agent run dev:tui | pnpm --filter koris-agent run dev:telegram | pnpm --filter koris-agent run dev");
    process.exit(1);
  }

  if (tuiMode) {
    startTUI({ logger, handler });
  }

  if (telegramMode) {
    logger.info("Mode: Telegram Bot\n");

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
    startWebServer(logger, handler).catch((error) => {
      logger.error("Failed to start web server:", error);
      process.exit(1);
    });
  }
}

if (require.main === module) {
  startCliMode();
}
