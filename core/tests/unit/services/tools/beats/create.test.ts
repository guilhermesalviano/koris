import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  save: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
  getById: vi.fn(),
  deleteById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/repositories/heartbeat', () => ({
  HeartbeatRepositoryFactory: { create: vi.fn().mockReturnValue(mockRepo) },
}));

import { setBeat } from '../../../../../src/services/tools/beats/create';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('setBeat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when beat is missing', async () => {
    const result = await setBeat(logger, { cron_expression: '0 9 * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('beat');
  });

  it('returns error when cron_expression is missing', async () => {
    const result = await setBeat(logger, { beat: 'do something' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('cron_expression');
  });

  it('returns error for invalid type', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '0 9 * * *', type: 'invalid_type' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid parameter: type');
  });

  it('returns error for invalid cron expression', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: 'bad cron' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid cron expression');
  });

  it('returns error when wildcard minutes are used without a specific hour', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '* * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('allows hourly schedules without a specific hour', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '0 * * * *' });
    expect(result.success).toBe(true);
  });

  it('do not allow every-minute schedules when an hour is provided', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '* 9 * * *' });
    expect(result.success).toBe(false);
  });

  it('saves the beat and returns success for valid input', async () => {
    const result = await setBeat(logger, { beat: 'send report', cron_expression: '0 9 * * 1' });
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('set_beat');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('returns success with scheduled_beat type', async () => {
    const result = await setBeat(logger, { beat: 'sync data', cron_expression: '0 2 * * *', type: 'scheduled_beat' });
    expect(result.success).toBe(true);
  });

  it('result contains the saved heartbeat as JSON', async () => {
    const result = await setBeat(logger, { beat: 'ping', cron_expression: '0 9 * * *' });
    const parsed = JSON.parse(result.result!);
    expect(parsed.beat).toBe('ping');
    expect(parsed.cronExpression).toBe('0 9 * * *');
  });

  it('returns error for invalid channel', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '0 9 * * *', channel: 'slack', target: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid parameter: channel');
  });

  it('returns error when only one of channel or target is provided', async () => {
    const result = await setBeat(logger, { beat: 'do', cron_expression: '0 9 * * *', channel: 'telegram' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('together');
  });

  it('saves the beat with channel and target', async () => {
    const result = await setBeat(logger, {
      beat: 'send report',
      cron_expression: '0 9 * * 1',
      channel: 'whatsapp',
      target: '5511@s.whatsapp.net',
    });
    expect(result.success).toBe(true);
    const saved = mockRepo.save.mock.calls[0][0];
    expect(saved.channel).toBe('whatsapp');
    expect(saved.target).toBe('5511@s.whatsapp.net');
  });

  it('returns error when repo.save throws', async () => {
    mockRepo.save.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await setBeat(logger, { beat: 'x', cron_expression: '0 9 * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
