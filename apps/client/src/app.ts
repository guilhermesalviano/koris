// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { initBot } from 'assistant-telegram-bot';
import { startTUI } from './tui';
import { startWebServer } from './dashboard';
import { LoggerFactory } from './infrastructure/logger';
import { handleMessage } from './channels/telegram';
import { config } from './config';
import { AgentFactory } from './services/agents/main-agent/agent';
import { HeartbeatFactory } from './services/agents/sub-agents/heartbeat';


const logger = LoggerFactory.create();

let isHeartbeatRunning = false;

async function heartbeatHandle() {
  if (!config.HEARTBEAT.ENABLED || isHeartbeatRunning) return;

  isHeartbeatRunning = true;
  const date = new Date();
  logger.info(`[${date.toISOString()}] Agent waking up...`);

  try {
    const agent = HeartbeatFactory.create(logger, 'tui');
    await agent.handler(date);
  } catch (error: any) {
    logger.error('Heartbeat failed:', error);
  } finally {
    isHeartbeatRunning = false;
  }
}

heartbeatHandle();
setInterval(heartbeatHandle, 60 * 1000);

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
      const agent = AgentFactory.create(logger, 'telegram');
      const bot = initBot({
        token: config.TELEGRAM.BOT_TOKEN,
        polling: true,
        onMessage: (msg) => handleMessage(agent, msg),
      });
      logger.info("Telegram is ready!");
      return () => bot.stopPolling();
    },
  },
];

function startCliMode(): void {
  const stopFns: StopFn[] = [];
  const agent = AgentFactory.create(logger, 'tui');

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

  startWebServer(logger, agent).catch((error) => {
    logger.error("Failed to start web server:", error);
    process.exit(1);
  });

  if (hasFlag('tui')) {
    startTUI({ logger, agent });
  }
}

if (require.main === module) {
  startCliMode();
}
