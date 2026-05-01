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
import { ChannelsSingleton } from './channels';

const TUI_FLAG = 'tui';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const logger = LoggerFactory.create();

type CliRuntime = {
  agent: ReturnType<typeof AgentFactory.create>;
  channels: ReturnType<typeof ChannelsSingleton.getInstance>;
  heartbeat: ReturnType<typeof startHeartbeat>;
  webServer: Awaited<ReturnType<typeof startWebServer>>;
};

function hasFlag(flag: string, argv: string[] = process.argv): boolean {
  return argv.includes(flag) || argv.includes(`--${flag}`);
}

function logError(message: string, error: unknown): void {
  logger.error(message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

async function createCliRuntime(): Promise<CliRuntime> {
  const agent = AgentFactory.create(logger, 'tui');
  const channels = ChannelsSingleton.getInstance(logger, agent);

  channels.startAll();
  const heartbeat = startHeartbeat();

  try {
    const webServer = await startWebServer(logger, agent);
    return { agent, channels, heartbeat, webServer };
  } catch (error) {
    channels.stopAll();
    heartbeat.stop();
    throw error;
  }
}

function createShutdownHandler(runtime: CliRuntime) {
  let isShuttingDown = false;

  return async (reason: string, exitCode?: number): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info(`Shutting down application (${reason})...`);

    runtime.channels.stopAll();
    runtime.heartbeat.stop();

    try {
      await runtime.webServer.stop();
    } catch (error) {
      logError(`Failed to stop web server during ${reason}.`, error);
    }

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  };
}

function registerShutdownHandlers(runtime: CliRuntime): void {
  const shutdown = createShutdownHandler(runtime);

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void shutdown(signal, 0);
    });
  }

  process.once('beforeExit', () => {
    void shutdown('beforeExit');
  });
}

async function startCliMode(): Promise<void> {
  const runtime = await createCliRuntime();
  registerShutdownHandlers(runtime);

  if (hasFlag(TUI_FLAG)) {
    startTUI({ logger, agent: runtime.agent });
  }
}

if (require.main === module) {
  startCliMode().catch((error) => {
    logError('Failed to start application.', error);
    process.exit(1);
  });
}
