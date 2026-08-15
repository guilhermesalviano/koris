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

import { updateBeat } from '../../../../../src/services/tools/beats/update';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
const existingBeat = { id: 'hb-1', beat: 'old beat', type: 'reminder', cronExpression: '0 8 * * *' };

describe('updateBeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.getById.mockReturnValue(existingBeat);
    mockRepo.update.mockReturnValue({ ...existingBeat });
  });

  it('returns error when id is missing', async () => {
    const result = await updateBeat(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when no update fields are provided', async () => {
    const result = await updateBeat(logger, { id: 'hb-1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('At least one');
  });

  it('returns error for invalid type', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', type: 'bad_type' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid type');
  });

  it('returns error for invalid cron expression', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', cron_expression: 'bad cron' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid cron expression');
  });

  it('returns error when wildcard minutes are used without a specific hour', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', cron_expression: '* * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('allows hourly schedules without a specific hour', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', cron_expression: '0 * * * *' });
    expect(result.success).toBe(true);
  });

  it('do not allows every-minute schedules', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', cron_expression: '* 9 * * *' });
    expect(result.success).toBe(false);
  });

  it('returns error when beat not found', async () => {
    mockRepo.getById.mockReturnValue(null);
    const result = await updateBeat(logger, { id: 'hb-1', beat: 'new beat' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns success when updating beat field', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', beat: 'new beat' });
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('update_beat');
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('returns success when updating cron_expression', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', cron_expression: '0 10 * * *' });
    expect(result.success).toBe(true);
  });

  it('returns success when updating type', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', type: 'scheduled_beat' });
    expect(result.success).toBe(true);
  });

  it('returns error for invalid channel', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', channel: 'slack', target: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid channel');
  });

  it('returns error when only one of channel or target is provided', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', channel: 'telegram' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('together');
  });

  it('returns success when updating channel and target', async () => {
    const result = await updateBeat(logger, { id: 'hb-1', channel: 'whatsapp', target: '5511@s.whatsapp.net' });
    expect(result.success).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith(
      'hb-1',
      expect.objectContaining({ channel: 'whatsapp', target: '5511@s.whatsapp.net' }),
    );
  });

  it('returns error when repo throws', async () => {
    mockRepo.getById.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await updateBeat(logger, { id: 'hb-1', beat: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
