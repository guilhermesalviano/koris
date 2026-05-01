import { config } from '../config';
import { LoggerFactory, type ILogger } from '../infrastructure/logger';
import { HeartbeatFactory } from '../services/agents/sub-agents/heartbeat';

interface HeartbeatController {
  start(): void;
  stop(): void;
}

class HeartbeatRunner implements HeartbeatController {
  private isRunning = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly logger: ILogger,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (!config.HEARTBEAT.ENABLED) {
      this.logger.info('Heartbeat disabled by configuration.');
      return;
    }

    if (this.timer) {
      return;
    }

    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private async runOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Heartbeat tick skipped because the previous run is still active.');
      return;
    }

    this.isRunning = true;
    const date = new Date();
    this.logger.info(`[${date.toISOString()}] Agent waking up...`);

    try {
      const agent = HeartbeatFactory.create(this.logger);
      await agent.handler(date);
    } catch (error) {
      this.logger.error('Heartbeat failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }
}

function startHeartbeat(): HeartbeatController {
  const runner = new HeartbeatRunner(LoggerFactory.create(), config.HEARTBEAT.INTERVAL_MS);
  runner.start();
  return runner;
}

export { startHeartbeat, HeartbeatController };