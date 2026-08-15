import { config } from '../../../../config';
import { IChannelsManager } from '../../../../channels';
import type { ILogger } from '../../../../infrastructure/logger';
import { HeartbeatFactory } from './sub-agent';
import { beginFooterActivity } from '../../../../utils/footer-activity';
import { nextCronFire } from '../../../../utils/heartbeat';
import { formatISO } from '../../../../utils/date';
import { IHeartbeatRepository } from '../../../../repositories/heartbeat';
import { IHeartbeatRunRepository } from '../../../../repositories/heartbeat-run';

interface IHeartbeatRunner {
  start(): void;
  stop(): void;
  reschedule(): void;
}

class HeartbeatRunner implements IHeartbeatRunner {
  private isRunning = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private logger: ILogger,
    private heartbeatRepository: IHeartbeatRepository,
    private channelsManager: IChannelsManager,
    private heartbeatRunRepository: IHeartbeatRunRepository,
  ) {}

  start(): void {
    if (!config.HEARTBEAT) {
      this.logger.info('Heartbeat disabled by configuration.');
      return;
    }

    if (this.timer) {
      return;
    }

    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (config.HEARTBEAT) {
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    const beats = this.heartbeatRepository.getAll();

    if (beats.length === 0) {
      this.logger.info('Heartbeat: No scheduled beats, waiting for new beats to be added.');
      return;
    }

    const now = new Date();
    let earliest: Date | null = null;
    let earliestBeatId: string | null = null;

    for (const beat of beats) {
      const since = beat.lastRun ?? beat.createdAt;
      const from = since > now ? since : now;
      const next = nextCronFire(beat.cronExpression, from);
      if (next && (!earliest || next.getTime() < earliest.getTime())) {
        earliest = next;
        earliestBeatId = beat.id;
      }
    }

    if (!earliest) {
      this.logger.info('Heartbeat: No future cron matches found for any beat.');
      return;
    }

    const delay = Math.max(0, earliest.getTime() - now.getTime());
    this.timer = setTimeout(() => { void this.runOnce(); }, delay);
    this.logger.info(
      `Next heartbeat scheduled for beat "${earliestBeatId}" at ${formatISO(earliest)} (in ${Math.round(delay / 1000)}s)`,
    );
  }

  private async runOnce(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Heartbeat tick skipped because the previous run is still active.');
      return;
    }

    this.isRunning = true;
    const endFooterActivity = beginFooterActivity('heartbeat');
    const date = new Date();
    this.logger.info(`[${formatISO(date)}] Agent waking up...`);

    let errorMessage: string | undefined;

    try {
      const agent = HeartbeatFactory.create(this.logger, this.channelsManager);
      await agent.handler(date);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Heartbeat failed.', { error: errorMessage });
    } finally {
      endFooterActivity();
      this.isRunning = false;
      this.heartbeatRunRepository.recordRun({
        runAt: new Date(),
        status: errorMessage ? 'error' : 'success',
        errorMessage,
      });
      this.scheduleNext();
    }
  }
}

class HeartbeatSingleton {
  private static instance: HeartbeatRunner | null = null;

  static getInstance(
    logger: ILogger,
    heartbeatRepository: IHeartbeatRepository,
    channelsManager: IChannelsManager,
    heartbeatRunRepository: IHeartbeatRunRepository,
  ): HeartbeatRunner {
    if (!HeartbeatSingleton.instance) {
      HeartbeatSingleton.instance = new HeartbeatRunner(
        logger,
        heartbeatRepository,
        channelsManager,
        heartbeatRunRepository,
      );
    }
    return HeartbeatSingleton.instance;
  }

  static getExistingInstance(): HeartbeatRunner | null {
    return HeartbeatSingleton.instance;
  }
}

export { IHeartbeatRunner, HeartbeatSingleton };
