import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { Heartbeat } from '../../../../../../src/services/agents/sub-agents/heartbeat/sub-agent';
import { config } from '../../../../../../src/config';
import { applyTestConfigDefaults } from '../../../../../helpers/test-config';
import type { ILogger } from '../../../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeHeartbeat(overrides: Partial<{
  tasks: Array<{ id: string; task: string; cronExpression: string; type: string; lastRun?: Date }>;
  completionResponse: unknown;
  executorResult: string;
}> = {}) {
  const logger = makeLogger();
  const heartbeatRepository = {
    getAll: vi.fn().mockReturnValue(overrides.tasks ?? []),
    updateLastRun: vi.fn(),
  };
  const promptRepository = {
    build: vi.fn().mockReturnValue({ messages: [{ role: 'user', content: 'prompt' }] }),
  };
  const completionService = {
    complete: vi.fn().mockResolvedValue(
      overrides.completionResponse ?? { kind: 'message', text: 'task done' },
    ),
  };
  const executorWorker = {
    run: vi.fn().mockResolvedValue(overrides.executorResult ?? 'executed'),
  };
  const channelsManager = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };

  const heartbeat = new Heartbeat(
    logger,
    promptRepository as never,
    heartbeatRepository as never,
    { enqueue: vi.fn() } as never,
    channelsManager as never,
    completionService as never,
    executorWorker as never,
  );

  return {
    heartbeat,
    logger,
    heartbeatRepository,
    promptRepository,
    completionService,
    executorWorker,
    channelsManager,
  };
}

function localDate(hours: number, minutes = 0): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe('Heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('activeHoursHelper', () => {
    it('returns start and end dates using configured active hours', () => {
      const { heartbeat } = makeHeartbeat();
      const [start, end] = heartbeat.activeHoursHelper();

      expect(start.getHours()).toBe(Number(config.HEARTBEAT.ACTIVE_HOURS.START.split(':')[0]));
      expect(start.getMinutes()).toBe(Number(config.HEARTBEAT.ACTIVE_HOURS.START.split(':')[1]));
      expect(end.getHours()).toBe(Number(config.HEARTBEAT.ACTIVE_HOURS.END.split(':')[0]));
      expect(end.getMinutes()).toBe(Number(config.HEARTBEAT.ACTIVE_HOURS.END.split(':')[1]));
    });
  });

  describe('isWithinActiveHours', () => {
    it('accepts times inside a same-day window', () => {
      const { heartbeat } = makeHeartbeat();
      const [start, end] = heartbeat.activeHoursHelper();

      expect(heartbeat.isWithinActiveHours(localDate(12), start, end)).toBe(true);
      expect(heartbeat.isWithinActiveHours(localDate(7), start, end)).toBe(false);
    });

    it('accepts times inside an overnight window', () => {
      applyTestConfigDefaults({ heartbeatActiveHours: { start: '22:00', end: '06:00' } });
      const { heartbeat } = makeHeartbeat();
      const [start, end] = heartbeat.activeHoursHelper();

      expect(heartbeat.isWithinActiveHours(localDate(23, 30), start, end)).toBe(true);
      expect(heartbeat.isWithinActiveHours(localDate(3), start, end)).toBe(true);
      expect(heartbeat.isWithinActiveHours(localDate(12), start, end)).toBe(false);
    });
  });

  describe('formatDateStamp', () => {
    it('formats dates as YYYY_MM_DD_HH_mm', () => {
      const { heartbeat } = makeHeartbeat();
      const date = new Date(2024, 5, 3, 9, 7, 0);

      expect(heartbeat.formatDateStamp(date)).toBe('2024_06_03_09_07');
    });
  });

  describe('saveTaskResult', () => {
    const tempDir = join(config.BASE_DIR, config.TEMP_FOLDER, 'heartbeat-tests');

    beforeEach(() => {
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('writes the task result to a timestamped markdown file', () => {
      applyTestConfigDefaults({ tempFolder: join('temp', 'heartbeat-tests') });
      const { heartbeat, logger } = makeHeartbeat();
      const date = new Date(2024, 0, 15, 10, 30, 0);

      heartbeat.saveTaskResult({ taskId: 'daily-check', date, result: '# report\nall good' });

      const filePath = join(config.BASE_DIR, config.TEMP_FOLDER, 'daily-check_2024_01_15_10_30.md');
      expect(readFileSync(filePath, 'utf-8')).toBe('# report\nall good');
      expect(logger.info).toHaveBeenCalledWith(`Heartbeat: Task result saved to ${filePath}`);
    });
  });

  describe('handler', () => {
    it('skips execution outside active hours', async () => {
      const { heartbeat, logger, heartbeatRepository, completionService } = makeHeartbeat({
        tasks: [{ id: 't1', task: 'check logs', cronExpression: '* * * * *', type: 'maintenance' }],
      });

      await heartbeat.handler(localDate(23, 30));

      expect(heartbeatRepository.getAll).toHaveBeenCalled();
      expect(completionService.complete).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('outside of active hours'));
    });

    it('runs tasks during overnight active hours', async () => {
      applyTestConfigDefaults({ heartbeatActiveHours: { start: '22:00', end: '06:00' } });
      const now = localDate(23, 30);
      const { heartbeat, completionService, heartbeatRepository } = makeHeartbeat({
        tasks: [{
          id: 'night-check',
          task: 'nightly job',
          cronExpression: '30 23 * * *',
          type: 'maintenance',
        }],
        completionResponse: { kind: 'message', text: 'night ok' },
      });

      await heartbeat.handler(now);

      expect(completionService.complete).toHaveBeenCalled();
      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('night-check', now);
    });

    it('logs when there are no scheduled tasks', async () => {
      const { heartbeat, logger } = makeHeartbeat({ tasks: [] });

      await heartbeat.handler(localDate(12));

      expect(logger.info).toHaveBeenCalledWith('Heartbeat: No scheduled tasks found.');
    });

    it('skips tasks that are not due yet', async () => {
      const now = localDate(12, 5);
      const lastRun = localDate(12, 0);
      const { heartbeat, logger, completionService } = makeHeartbeat({
        tasks: [{
          id: 'hourly',
          task: 'sync data',
          cronExpression: '0 13 * * *',
          type: 'sync',
          lastRun,
        }],
      });

      await heartbeat.handler(now);

      expect(completionService.complete).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not due yet'));
    });

    it('executes due tasks and sends the result to Telegram', async () => {
      const now = localDate(9, 0);
      const { heartbeat, completionService, channelsManager, heartbeatRepository, logger } = makeHeartbeat({
        tasks: [{
          id: 'morning',
          task: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
      });

      await heartbeat.handler(now);

      expect(completionService.complete).toHaveBeenCalled();
      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'telegram',
        config.CHANNELS.TELEGRAM.CHAT_ID,
        'status ok',
      );
      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('morning', now);
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Task "morning" completed successfully.');
    });

    it('routes tool-call responses through the executor worker', async () => {
      const now = localDate(9, 0);
      const toolCalls = [{ name: 'execute_command', arguments: { command: 'echo hi' } }];
      const { heartbeat, executorWorker, channelsManager } = makeHeartbeat({
        tasks: [{
          id: 'tool-task',
          task: 'run command',
          cronExpression: '0 9 * * *',
          type: 'automation',
        }],
        completionResponse: { kind: 'tool_calls', calls: toolCalls },
        executorResult: 'hi',
      });

      await heartbeat.handler(now);

      expect(executorWorker.run).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCalls,
          userMessage: 'run command',
          messageHistory: [],
        }),
      );
      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'telegram',
        config.CHANNELS.TELEGRAM.CHAT_ID,
        'hi',
      );
    });

    it('continues executing remaining tasks when one task fails', async () => {
      const now = localDate(9, 0);
      const { heartbeat, logger, completionService, heartbeatRepository, channelsManager } = makeHeartbeat({
        tasks: [
          {
            id: 'failing',
            task: 'broken task',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
          {
            id: 'success',
            task: 'healthy task',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
        ],
      });
      completionService.complete
        .mockRejectedValueOnce(new Error('model failed'))
        .mockResolvedValueOnce({ kind: 'message', text: 'all good' });

      await heartbeat.handler(now);

      expect(completionService.complete).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        'Heartbeat: Task "failing" failed.',
        expect.objectContaining({ err: expect.any(Error) }),
      );
      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('success', now);
      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'telegram',
        config.CHANNELS.TELEGRAM.CHAT_ID,
        'all good',
      );
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Task "success" completed successfully.');
    });

    it('logs task failures without stopping other tasks', async () => {
      const now = localDate(9, 0);
      const { heartbeat, logger, completionService } = makeHeartbeat({
        tasks: [{
          id: 'failing',
          task: 'broken task',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
      });
      completionService.complete.mockRejectedValue(new Error('model failed'));

      await heartbeat.handler(now);

      expect(logger.error).toHaveBeenCalledWith(
        'Heartbeat: Task "failing" failed.',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });
});
