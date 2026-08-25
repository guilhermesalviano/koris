// Must run before any module-level LoggerFactory.create() calls (e.g. db-sqlite.ts).
// Detecting --tui flag directly from argv here silences the console transport
// globally, preventing any log output from breaking the TUI alt-screen layout.
if (process.argv.includes('tui') || process.argv.includes('--tui')) {
  process.env.LOG_SILENCE_CONSOLE = 'true';
}

import { startTUI } from '../apps/tui';
import { LoggerFactory, ILogger } from './infrastructure/logger';
import { MessageGatewayFactory, IMessageGateway } from './services/agents/message-gateway';
import { IHeartbeatRunner, HeartbeatSingleton } from './services/agents/sub-agents/heartbeat/runner';
import { ChannelsSingleton, ADAPTERS, ChannelHandlerFactory, type IChannelsManager } from './channels';
import { SHUTDOWN_SIGNALS } from './constants/tui';
import { hasFlag, logError } from './utils/runtime';
import { SessionManager } from './services/session-manager';
import { DatabaseServiceFactory } from './infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from './repositories/heartbeat';
import { HeartbeatRunRepositoryFactory } from './repositories/heartbeat-run';
import { seedDefaultBeats } from './services/agents/sub-agents/heartbeat/default-beats';
import { SkillsRepositoryFactory } from './repositories/skills';
import { LearnedSkillsRepositoryFactory } from './repositories/learned-skills';
import { SkillSyncSingleton } from './services/skills/skill-sync';
import { DashboardServerFactory, WebServerHandle } from './dashboard';
import { createPlugins, buildRegistry } from '../plugins/channels';
import { config } from './config';
import type { PluginContext } from '../plugins/channels/contracts';

const logger = LoggerFactory.create();
const MODES = ['tui', 'web'] as const;

function createPluginContext(logger: ILogger, gateway: IMessageGateway): PluginContext {
  return {
    allowUntrusted: config.CHANNELS.ALLOW_UNTRUSTED,
    logger,
    gateway,
    channelHandler: ChannelHandlerFactory,
  };
}

type Mode = typeof MODES[number];
type RuntimeModes = Record<Mode, boolean>;

interface IRuntime {
  gateway: IMessageGateway;
  channels: IChannelsManager;
  heartbeat: IHeartbeatRunner;
  webServer: WebServerHandle | null;
};

interface IApplication {
  start(): Promise<void>;
}

class Application implements IApplication {
  private runtime: IRuntime | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly logger: ILogger,
    private readonly source: Mode = resolveSessionSourceFromArgs(),
    private readonly modes: RuntimeModes = resolveRuntimeModes(),
  ) {}

  async start(): Promise<void> {
    this.runtime = await this.createCliRuntime();
    this.registerShutdownHandlers();
    this.startTuiIfEnabled();
  }

  private async createCliRuntime(): Promise<IRuntime> {
    const db = DatabaseServiceFactory.create();
    seedDefaultBeats(db, this.logger);
    const sessionManager = new SessionManager(db);
    const gateway = MessageGatewayFactory.create(this.logger, this.source, db, sessionManager);
    const registry = buildRegistry(createPlugins({ context: createPluginContext(this.logger, gateway) }));
    const channels = ChannelsSingleton.getInstance(this.logger, gateway, registry.collect(ADAPTERS));
    const heartbeat = HeartbeatSingleton.getInstance(
      this.logger,
      HeartbeatRepositoryFactory.create(db),
      channels,
      HeartbeatRunRepositoryFactory.create(db),
    );
    const skillSync = SkillSyncSingleton.getInstance(
      this.logger,
      SkillsRepositoryFactory.create(this.logger),
      LearnedSkillsRepositoryFactory.create(db),
    );

    channels.startAll();
    heartbeat.start();
    skillSync.start();

    try {
      const webServer = this.modes.web
        ? await DashboardServerFactory.create(this.logger, gateway, db).start()
        : null;

      return { gateway, channels, heartbeat, webServer };
    } catch (error) {
      channels.stopAll();
      heartbeat.stop();
      throw error;
    }
  }

  private startTuiIfEnabled(): void {
    if (!this.runtime || !this.modes.tui) {
      return;
    }

    const { gateway } = this.runtime;

    startTUI({
      title: 'koris',
      showHints: false,
      placeholder: 'Type /help for commands.',
      onInput: async (input: string) => gateway.handle(input, 'tui'),
    });
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
    SkillSyncSingleton.getExistingInstance()?.stop();

    try {
      await this.runtime.webServer?.stop();
    } catch (error) {
      logError(this.logger, `Failed to stop web server during ${reason}.`, error);
    }

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }
}

function resolveRuntimeModes(argv: string[] = process.argv): RuntimeModes {
  const explicitModes = MODES.reduce<RuntimeModes>((modes, mode) => {
    modes[mode] = hasFlag(mode, argv);
    return modes;
  }, { tui: false, web: false });

  if (Object.values(explicitModes).some(Boolean)) {
    return explicitModes;
  }

  return {
    tui: false,
    web: true,
  };
}

function resolveSessionSourceFromArgs(argv: string[] = process.argv): Mode {
  const modesArg = resolveRuntimeModes(argv);

  for (const mode of MODES) {
    if (modesArg[mode]) {
      return mode;
    }
  }

  return 'web';
}

const app = new Application(logger);

if (require.main === module) {
  app.start().catch((error) => {
    logError(logger, 'Failed to start application.', error);
    process.exit(1);
  });
}
