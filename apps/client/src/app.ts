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
import { HeartbeatController, startHeartbeat } from './heartbeat';
import { ChannelsSingleton, IChannelsManager } from './channels';
import { SHUTDOWN_SIGNALS } from './constants/tui';
import { hasFlag, logError } from './utils/runtime';

const logger = LoggerFactory.create();

interface ICliRuntime {
  agent: IAgent;
  channels: IChannelsManager;
  heartbeat: HeartbeatController;
  webServer: Awaited<ReturnType<typeof startWebServer>>;
};

interface ICliApplication {
  start(): Promise<void>;
}

class CliApplication implements ICliApplication {
  private runtime: ICliRuntime | null = null;
  private isShuttingDown = false;

  constructor(private readonly logger: ILogger) {}

  async start(): Promise<void> {
    this.runtime = await this.createCliRuntime();
    this.registerShutdownHandlers();
    this.startTuiIfEnabled();
  }

  private async createCliRuntime(): Promise<ICliRuntime> {
    const agent = AgentFactory.create(this.logger, 'tui');
    const channels = ChannelsSingleton.getInstance(this.logger, agent);

    channels.startAll();
    const heartbeat = startHeartbeat();

    try {
      const webServer = await startWebServer(this.logger, agent);
      return { agent, channels, heartbeat, webServer };
    } catch (error) {
      channels.stopAll();
      heartbeat.stop();
      throw error;
    }
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

  private startTuiIfEnabled(): void {
    if (!this.runtime || !hasFlag('tui')) {
      return;
    }

    startTUI({ logger: this.logger, agent: this.runtime.agent });
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

const app = new CliApplication(logger);

if (require.main === module) {
  app.start().catch((error) => {
    logError(logger, 'Failed to start application.', error);
    process.exit(1);
  });
}
