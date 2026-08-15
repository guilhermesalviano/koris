import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Heartbeat } from '../../../../../../src/services/agents/sub-agents/heartbeat/sub-agent';
import { config } from '../../../../../../src/config';
import type { ILogger } from '../../../../../../src/infrastructure/logger';
import { sharedSubAgentQueue } from '../../../../../../src/services/sub-agents-queue/task-queue';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeHeartbeat(overrides: Partial<{
  beats: Array<{ id: string; beat: string; cronExpression: string; type: string; channel?: string; target?: string; lastRun?: Date }>;
  completionResponse: unknown;
  pipelineResult: string;
  deliveryTarget: { channel: string; target: string } | null;
}> = {}) {
  const logger = makeLogger();
  const heartbeatRepository = {
    getAll: vi.fn().mockReturnValue(overrides.beats ?? []),
    updateLastRun: vi.fn(),
  };
  const promptRepository = {
    build: vi.fn().mockReturnValue({ messages: [{ role: 'user', content: 'prompt' }] }),
  };
  const completionService = {
    complete: vi.fn().mockResolvedValue(
      overrides.completionResponse ?? { kind: 'message', text: 'beat done' },
    ),
  };
  const pipeline = {
    execute: vi.fn().mockResolvedValue(overrides.pipelineResult ?? 'executed'),
  };
  const channelsManager = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
  const channelService = {
    resolveDelivery: vi.fn().mockReturnValue(
      overrides.deliveryTarget === undefined
        ? { channel: 'telegram', target: '987654321' }
        : overrides.deliveryTarget,
    ),
  };

  const heartbeat = new Heartbeat(
    logger,
    promptRepository as never,
    heartbeatRepository as never,
    { enqueue: vi.fn() } as never,
    channelsManager as never,
    completionService as never,
    pipeline as never,
    channelService as never,
  );

  return {
    heartbeat,
    logger,
    heartbeatRepository,
    promptRepository,
    completionService,
    pipeline,
    channelsManager,
    channelService,
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

  describe('handler', () => {
    it('logs when there are no scheduled beats', async () => {
      const { heartbeat, logger } = makeHeartbeat({ beats: [] });

      await heartbeat.handler(localDate(12));

      expect(logger.info).toHaveBeenCalledWith('Heartbeat: No scheduled beats found.');
    });

    it('skips beats that are not due yet', async () => {
      const now = localDate(12, 5);
      const lastRun = localDate(12, 0);
      const { heartbeat, logger, completionService } = makeHeartbeat({
        beats: [{
          id: 'hourly',
          beat: 'sync data',
          cronExpression: '0 13 * * *',
          type: 'sync',
          lastRun,
        }],
      });

      await heartbeat.handler(now);

      expect(completionService.complete).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not due yet'));
    });

    it('executes due beats and delivers the result via the resolved channel', async () => {
      const now = localDate(9, 0);
      const { heartbeat, completionService, channelsManager, channelService, heartbeatRepository, logger } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
        deliveryTarget: { channel: 'telegram', target: '987654321' },
      });

      await heartbeat.handler(now);

      expect(completionService.complete).toHaveBeenCalled();
      expect(channelService.resolveDelivery).toHaveBeenCalledWith(expect.objectContaining({ id: 'morning' }));
      expect(channelsManager.sendMessage).toHaveBeenCalledWith('telegram', '987654321', 'status ok');
      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('morning', now);
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Beat "morning" completed successfully.');
    });

    it('routes tool-call responses through the tool-call pipeline', async () => {
      const now = localDate(9, 0);
      const toolCalls = [{ name: 'execute_command', arguments: { command: 'echo hi' } }];
      const { heartbeat, pipeline, channelsManager } = makeHeartbeat({
        beats: [{
          id: 'tool-beat',
          beat: 'run command',
          cronExpression: '0 9 * * *',
          type: 'automation',
        }],
        completionResponse: { kind: 'tool_calls', calls: toolCalls },
        pipelineResult: 'hi',
        deliveryTarget: { channel: 'telegram', target: '987654321' },
      });

      await heartbeat.handler(now);

      expect(pipeline.execute).toHaveBeenCalledWith(
        toolCalls,
        'run command',
        [],
        expect.objectContaining({
          channel: 'background',
          options: expect.objectContaining({ runId: 'tool-beat' }),
        }),
      );
      expect(channelsManager.sendMessage).toHaveBeenCalledWith('telegram', '987654321', 'hi');
    });

    it('continues executing remaining beats when one beat fails', async () => {
      const now = localDate(9, 0);
      const { heartbeat, logger, completionService, heartbeatRepository, channelsManager } = makeHeartbeat({
        beats: [
          {
            id: 'failing',
            beat: 'broken beat',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
          {
            id: 'success',
            beat: 'healthy beat',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
        ],
        deliveryTarget: { channel: 'telegram', target: '987654321' },
      });
      completionService.complete
        .mockRejectedValueOnce(new Error('model failed'))
        .mockResolvedValueOnce({ kind: 'message', text: 'all good' });

      await heartbeat.handler(now);

      expect(completionService.complete).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        'Heartbeat: Beat "failing" failed.',
        expect.objectContaining({ err: expect.any(Error) }),
      );
      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('success', now);
      expect(channelsManager.sendMessage).toHaveBeenCalledWith('telegram', '987654321', 'all good');
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Beat "success" completed successfully.');
    });

    it('delivers to the beat channel and target when specified', async () => {
      const now = localDate(9, 0);
      const { heartbeat, channelsManager, channelService } = makeHeartbeat({
        beats: [{
          id: 'group-beat',
          beat: 'daily report',
          cronExpression: '0 9 * * *',
          type: 'report',
          channel: 'whatsapp',
          target: '5511948449969@s.whatsapp.net',
        }],
        completionResponse: { kind: 'message', text: 'group report' },
      });
      (channelService.resolveDelivery as ReturnType<typeof vi.fn>).mockReturnValue({
        channel: 'whatsapp',
        target: '5511948449969@s.whatsapp.net',
      });

      await heartbeat.handler(now);

      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'whatsapp',
        '5511948449969@s.whatsapp.net',
        'group report',
      );
    });

    it('does not send when no delivery channel is resolved', async () => {
      const now = localDate(9, 0);
      const { heartbeat, channelsManager, logger } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
        deliveryTarget: null,
      });

      await heartbeat.handler(now);

      expect(channelsManager.sendMessage).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No delivery channel recorded'),
      );
    });

    it('logs beat failures without stopping other beats', async () => {
      const now = localDate(9, 0);
      const { heartbeat, logger, completionService } = makeHeartbeat({
        beats: [{
          id: 'failing',
          beat: 'broken beat',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
      });
      completionService.complete.mockRejectedValue(new Error('model failed'));

      await heartbeat.handler(now);

      expect(logger.error).toHaveBeenCalledWith(
        'Heartbeat: Beat "failing" failed.',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });

    it('marks lastRun at dispatch even when the beat execution fails', async () => {
      const now = localDate(9, 0);
      const { heartbeat, logger, completionService, heartbeatRepository } = makeHeartbeat({
        beats: [{
          id: 'failing',
          beat: 'broken beat',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
      });
      completionService.complete.mockRejectedValue(new Error('model failed'));

      await heartbeat.handler(now);

      expect(heartbeatRepository.updateLastRun).toHaveBeenCalledWith('failing', now);
      expect(logger.error).toHaveBeenCalledWith(
        'Heartbeat: Beat "failing" failed.',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });

    it('executes due beats serially through the internal queue when subagents_parallel is false', async () => {
      (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = true;
      const now = localDate(9, 0);
      const release: Array<() => void> = [];
      const gated = () => new Promise((resolve) => release.push(() => resolve({ kind: 'message', text: 'beat done' })));

      const { heartbeat, completionService, channelsManager } = makeHeartbeat({
        beats: [
          {
            id: 'beat-a',
            beat: 'first beat',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
          {
            id: 'beat-b',
            beat: 'second beat',
            cronExpression: '0 9 * * *',
            type: 'report',
          },
        ],
        deliveryTarget: { channel: 'telegram', target: '987654321' },
      });
      completionService.complete.mockImplementation(gated);

      const run = heartbeat.handler(now);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(completionService.complete).toHaveBeenCalledTimes(1);

      release[0]();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(completionService.complete).toHaveBeenCalledTimes(2);

      release[1]();
      await run;

      expect(channelsManager.sendMessage).toHaveBeenNthCalledWith(
        1,
        'telegram',
        '987654321',
        'beat done',
      );
      expect(channelsManager.sendMessage).toHaveBeenNthCalledWith(
        2,
        'telegram',
        '987654321',
        'beat done',
      );
    });

    it('uses the shared sub-agent queue when subagents_parallel is false', async () => {
      (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = false;
      const { heartbeat } = makeHeartbeat();

      expect((heartbeat as unknown as { queue: unknown }).queue).toBe(sharedSubAgentQueue);
    });

    it('uses its own queue when subagents_parallel is true', async () => {
      (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = true;
      const { heartbeat } = makeHeartbeat();

      expect((heartbeat as unknown as { queue: unknown }).queue).not.toBe(sharedSubAgentQueue);
    });

    it('exposes queue state via snapshot', async () => {
      (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = true;
      const now = localDate(9, 0);
      const release: Array<() => void> = [];
      const gated = () => new Promise((resolve) => release.push(() => resolve({ kind: 'message', text: 'ok' })));
      const { heartbeat, completionService } = makeHeartbeat({
        beats: [
          { id: 'a', beat: 'first beat', cronExpression: '0 9 * * *', type: 'report' },
          { id: 'b', beat: 'second beat', cronExpression: '0 9 * * *', type: 'report' },
        ],
      });
      completionService.complete.mockImplementation(gated);

      const run = heartbeat.handler(now);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const queue = (heartbeat as unknown as { queue: { snapshot(): unknown } }).queue;
      expect(queue.snapshot()).toEqual({ queued: 1, active: 1, concurrency: 1, queuedLabels: ['heartbeat: b'], activeLabels: ['heartbeat: a'] });

      release[0]();
      await new Promise((resolve) => setTimeout(resolve, 0));
      release[1]();
      await run;

      expect(queue.snapshot()).toEqual({ queued: 0, active: 0, concurrency: 1, queuedLabels: [], activeLabels: [] });
    });
  });
});
