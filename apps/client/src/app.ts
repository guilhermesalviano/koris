// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { startTUI } from './tui';
import { startWebServer } from './dashboard';
import { LoggerFactory, ILogger } from './infrastructure/logger';
import { AgentFactory, IAgent } from './services/agents/main-agent/agent';
import { IHeartbeatRunner, HeartbeatSingleton } from './heartbeat';
import { ChannelsSingleton, IChannelsManager } from './channels';
import { SHUTDOWN_SIGNALS } from './constants/tui';
import { hasFlag, logError } from './utils/runtime';
import { DatabaseServiceFactory } from './infrastructure/db-sqlite';
import { SessionServiceFactory } from './services/session-service';
import { config } from './config';

const logger = LoggerFactory.create();
const CHANNELS = ['tui', 'telegram', 'web'] as const;

type CliChannel = typeof CHANNELS[number];

interface ICliRuntime {
  agent: IAgent;
  channels: IChannelsManager;
  heartbeat: IHeartbeatRunner;
  webServer: Awaited<ReturnType<typeof startWebServer>>;
};

interface ICliApplication {
  start(): Promise<void>;
}

class CliApplication implements ICliApplication {
  private runtime: ICliRuntime | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly logger: ILogger,
    private readonly channel: CliChannel = resolveChannelFromArgs(),
  ) {}

  async start(): Promise<void> {
    this.runtime = await this.createCliRuntime();
    this.registerShutdownHandlers();
    this.startTuiIfEnabled();
  }

  private async createCliRuntime(): Promise<ICliRuntime> {
    const db = DatabaseServiceFactory.create();
    const session = SessionServiceFactory.create(db, this.channel);
    const agent = AgentFactory.create(this.logger, this.channel, db, session);

    const channels = ChannelsSingleton.getInstance(this.logger, agent);
    const heartbeat = HeartbeatSingleton.getInstance(this.logger, config.HEARTBEAT.INTERVAL_MS);

    channels.startAll();
    heartbeat.start();

    try {
      const webServer = await startWebServer(this.logger, agent);
      return { agent, channels, heartbeat, webServer };
    } catch (error) {
      channels.stopAll();
      heartbeat.stop();
      throw error;
    }
  }

  private startTuiIfEnabled(): void {
    if (!this.runtime || !hasFlag('tui')) {
      return;
    }

    startTUI({ logger: this.logger, agent: this.runtime.agent });
  }

  private registerShutdownHandlers(): void {
    for (const signal of SHUTDOWN_SIGNALS) {
      process.once(signal, () => {
        void this.shutdown(signal, 0);
      });
    }

    process.once('beforeExit', () => {
      void this.shutdown('beforeExit');
    });
  }

  private async shutdown(reason: string, exitCode?: number): Promise<void> {
    if (this.isShuttingDown || !this.runtime) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`Shutting down application (${reason})...`);

    this.runtime.channels.stopAll();
    this.runtime.heartbeat.stop();

    try {
      await this.runtime.webServer.stop();
    } catch (error) {
      logError(this.logger, `Failed to stop web server during ${reason}.`, error);
    }

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }
}

function resolveChannelFromArgs(argv: string[] = process.argv): CliChannel {
  for (const channel of CHANNELS) {
    if (hasFlag(channel, argv)) {
      return channel;
    }
  }

  return 'web';
}

const app = new CliApplication(logger);

if (require.main === module) {
  app.start().catch((error) => {
    logError(logger, 'Failed to start application.', error);
    process.exit(1);
  });
}
