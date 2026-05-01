// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { startTUI } from './tui';
import { startWebServer } from './dashboard';
import { LoggerFactory } from './infrastructure/logger';
import { AgentFactory } from './services/agents/main-agent/agent';
import { startHeartbeat } from './heartbeat';
import { channels, StopFn } from './channels';

const logger = LoggerFactory.create();

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag) || process.argv.includes(`--${flag}`);
}

function startCliMode(): void {
  const stopFns: StopFn[] = [];
  const agent = AgentFactory.create(logger, 'tui');
  startHeartbeat();

  for (const channel of channels) {
    if (!channel.enabled()) continue;
    logger.info(`Starting channel: ${channel.name}`);
    const stop = channel.start(logger, agent);
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
