// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './tui';
import { startWebServer } from './web';
import { LoggerFactory } from './infrastructure/logger';
import { handleMessage } from './channels/telegram';
import { config } from './config';
import { AgentHandlerFactory } from './services/agents/handler';
import { heartbeat } from './services/sub-agents/heartbeat';

const logger = LoggerFactory.create();

// tests
const date = new Date();
heartbeat({ logger, date }).catch((error) => {
  logger.error('Initial heartbeat failed:', error);
});

setInterval(async () => {
  const date = new Date();
  logger.info(`[${date.toISOString()}] Agent waking up...`);

  try {
    if (config.HEARTBEAT.ENABLED) {
      await heartbeat({ logger, date });
    }
  } catch (error: any) {
    logger.error('Heartbeat failed:', error);
  }
}, config.HEARTBEAT.INTERVAL_MS);


type StopFn = () => void;

interface ChannelDefinition {
  name: string;
  enabled: () => boolean;
  start: () => StopFn | void;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

const channels: ChannelDefinition[] = [
  {
    name: 'telegram',
    enabled: () => !!config.TELEGRAM.BOT_TOKEN,
    start: () => {
      const handler = AgentHandlerFactory.create(logger, 'telegram');
      const bot = initBot({
        token: config.TELEGRAM.BOT_TOKEN,
        polling: true,
        onMessage: (msg) => handleMessage(handler, msg),
      });
      logger.info("Telegram is ready!");
      return () => bot.stopPolling();
    },
  },
];

function startCliMode(): void {
  const stopFns: StopFn[] = [];

  for (const channel of channels) {
    if (!channel.enabled()) continue;
    logger.info(`Starting channel: ${channel.name}`);
    const stop = channel.start();
    if (typeof stop === 'function') stopFns.push(stop);
  }

  const shutdown = () => {
    logger.info("\n👋 Shutting down gracefully...");
    stopFns.forEach((stop) => stop());
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const handler = AgentHandlerFactory.create(logger, 'web');
  startWebServer(logger, handler).catch((error) => {
    logger.error("Failed to start web server:", error);
    process.exit(1);
  });

  if (hasFlag('tui')) {
    const handler = AgentHandlerFactory.create(logger, 'tui');
    startTUI({ logger, handler });
  }
}

if (require.main === module) {
  startCliMode();
}
