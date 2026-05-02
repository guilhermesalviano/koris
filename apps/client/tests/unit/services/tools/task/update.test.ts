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

import { updateTask } from '../../../../../src/services/tools/task/update';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
const existingTask = { id: 'hb-1', task: 'old task', type: 'reminder', cronExpression: '0 8 * * *' };

describe('updateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.getById.mockReturnValue(existingTask);
    mockRepo.update.mockReturnValue({ ...existingTask });
  });

  it('returns error when id is missing', async () => {
    const result = await updateTask(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when no update fields are provided', async () => {
    const result = await updateTask(logger, { id: 'hb-1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('At least one');
  });

  it('returns error for invalid type', async () => {
    const result = await updateTask(logger, { id: 'hb-1', type: 'bad_type' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid type');
  });

  it('returns error for invalid cron expression', async () => {
    const result = await updateTask(logger, { id: 'hb-1', cron_expression: 'bad cron' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid cron expression');
  });

  it('returns error for every-minute cron', async () => {
    const result = await updateTask(logger, { id: 'hb-1', cron_expression: '* * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('every minute');
  });

  it('returns error when no specific hour given', async () => {
    const result = await updateTask(logger, { id: 'hb-1', cron_expression: '0 * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('hour');
  });

  it('returns error when task not found', async () => {
    mockRepo.getById.mockReturnValue(null);
    const result = await updateTask(logger, { id: 'hb-1', task: 'new task' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns success when updating task field', async () => {
    const result = await updateTask(logger, { id: 'hb-1', task: 'new task' });
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('update_task');
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('returns success when updating cron_expression', async () => {
    const result = await updateTask(logger, { id: 'hb-1', cron_expression: '0 10 * * *' });
    expect(result.success).toBe(true);
  });

  it('returns success when updating type', async () => {
    const result = await updateTask(logger, { id: 'hb-1', type: 'scheduled_task' });
    expect(result.success).toBe(true);
  });

  it('returns error when repo throws', async () => {
    mockRepo.getById.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await updateTask(logger, { id: 'hb-1', task: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
