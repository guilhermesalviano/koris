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

import { setTask } from '../../../../../src/services/tools/task/create';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('setTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when task is missing', async () => {
    const result = await setTask(logger, { cron_expression: '0 9 * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('task');
  });

  it('returns error when cron_expression is missing', async () => {
    const result = await setTask(logger, { task: 'do something' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('cron_expression');
  });

  it('returns error for invalid type', async () => {
    const result = await setTask(logger, { task: 'do', cron_expression: '0 9 * * *', type: 'invalid_type' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid parameter: type');
  });

  it('returns error for invalid cron expression', async () => {
    const result = await setTask(logger, { task: 'do', cron_expression: 'bad cron' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid cron expression');
  });

  it('returns error for every-minute cron', async () => {
    const result = await setTask(logger, { task: 'do', cron_expression: '* * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('every minute');
  });

  it('returns error when no specific hour is given', async () => {
    const result = await setTask(logger, { task: 'do', cron_expression: '0 * * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('hour');
  });

  it('saves the task and returns success for valid input', async () => {
    const result = await setTask(logger, { task: 'send report', cron_expression: '0 9 * * 1' });
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('set_task');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('returns success with scheduled_task type', async () => {
    const result = await setTask(logger, { task: 'sync data', cron_expression: '0 2 * * *', type: 'scheduled_task' });
    expect(result.success).toBe(true);
  });

  it('result contains the saved heartbeat as JSON', async () => {
    const result = await setTask(logger, { task: 'ping', cron_expression: '0 9 * * *' });
    const parsed = JSON.parse(result.result!);
    expect(parsed.task).toBe('ping');
    expect(parsed.cronExpression).toBe('0 9 * * *');
  });

  it('returns error when repo.save throws', async () => {
    mockRepo.save.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await setTask(logger, { task: 'x', cron_expression: '0 9 * * *' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
