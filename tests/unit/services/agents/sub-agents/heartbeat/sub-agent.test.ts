import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { Heartbeat } from '../../../../../../src/services/agents/sub-agents/heartbeat/sub-agent';
import { config } from '../../../../../../src/config';
import { applyTestConfigDefaults } from '../../../../../helpers/test-config';
import type { ILogger } from '../../../../../../src/infrastructure/logger';
import { getLastWhitelistedJid } from '../../../../../../plugins/whatsapp';

vi.mock('../../../../../../plugins/whatsapp', () => ({
  getLastWhitelistedJid: vi.fn(() => null),
}));

const mockedGetLastWhitelistedJid = vi.mocked(getLastWhitelistedJid);

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeHeartbeat(overrides: Partial<{
  beats: Array<{ id: string; beat: string; cronExpression: string; type: string; lastRun?: Date }>;
  completionResponse: unknown;
  executorResult: string;
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

  describe('formatDateStamp', () => {
    it('formats dates as YYYY_MM_DD_HH_mm', () => {
      const { heartbeat } = makeHeartbeat();
      const date = new Date(2024, 5, 3, 9, 7, 0);

      expect(heartbeat.formatDateStamp(date)).toBe('2024_06_03_09_07');
    });
  });

  describe('saveBeatResult', () => {
    const tempDir = join(config.BASE_DIR, config.TEMP_FOLDER, 'heartbeat-tests');

    beforeEach(() => {
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('writes the beat result to a timestamped markdown file', () => {
      applyTestConfigDefaults({ tempFolder: join('temp', 'heartbeat-tests') });
      const { heartbeat, logger } = makeHeartbeat();
      const date = new Date(2024, 0, 15, 10, 30, 0);

      heartbeat.saveBeatResult({ beatId: 'daily-check', date, result: '# report\nall good' });

      const filePath = join(config.BASE_DIR, config.TEMP_FOLDER, 'daily-check_2024_01_15_10_30.md');
      expect(readFileSync(filePath, 'utf-8')).toBe('# report\nall good');
      expect(logger.info).toHaveBeenCalledWith(`Heartbeat: Beat result saved to ${filePath}`);
    });
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

    it('executes due beats and sends the result to Telegram', async () => {
      const now = localDate(9, 0);
      const { heartbeat, completionService, channelsManager, heartbeatRepository, logger } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
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
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Beat "morning" completed successfully.');
    });

    it('routes tool-call responses through the executor worker', async () => {
      const now = localDate(9, 0);
      const toolCalls = [{ name: 'execute_command', arguments: { command: 'echo hi' } }];
      const { heartbeat, executorWorker, channelsManager } = makeHeartbeat({
        beats: [{
          id: 'tool-beat',
          beat: 'run command',
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
      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'telegram',
        config.CHANNELS.TELEGRAM.CHAT_ID,
        'all good',
      );
      expect(logger.info).toHaveBeenCalledWith('Heartbeat: Beat "success" completed successfully.');
    });

    it('sends the result to the whitelisted sender remoteJid on WhatsApp', async () => {
      mockedGetLastWhitelistedJid.mockReturnValue('5511948449969@s.whatsapp.net');
      const now = localDate(9, 0);
      const { heartbeat, channelsManager } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
      });

      await heartbeat.handler(now);

      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'whatsapp',
        '5511948449969@s.whatsapp.net',
        'status ok',
      );
    });

    it('does not send to Telegram when the channel is disabled', async () => {
      applyTestConfigDefaults({ telegramEnabled: false });
      const now = localDate(9, 0);
      const { heartbeat, channelsManager } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
      });

      await heartbeat.handler(now);

      expect(channelsManager.sendMessage).not.toHaveBeenCalledWith(
        'telegram',
        config.CHANNELS.TELEGRAM.CHAT_ID,
        'status ok',
      );
    });

    it('falls back to configured target_jid when no whitelisted sender is known', async () => {
      mockedGetLastWhitelistedJid.mockReturnValue(null);
      const now = localDate(9, 0);
      const { heartbeat, channelsManager } = makeHeartbeat({
        beats: [{
          id: 'morning',
          beat: 'send status',
          cronExpression: '0 9 * * *',
          type: 'report',
        }],
        completionResponse: { kind: 'message', text: 'status ok' },
      });

      await heartbeat.handler(now);

      expect(channelsManager.sendMessage).toHaveBeenCalledWith(
        'whatsapp',
        config.CHANNELS.WHATSAPP.TARGET_JID,
        'status ok',
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
  });
});
