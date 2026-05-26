import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  save: vi.fn(),
  getAll: vi.fn(),
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

import { listTasks } from '../../../../../src/services/tools/task/list';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('listTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success with empty list', async () => {
    mockRepo.getAll.mockReturnValue([]);
    const result = await listTasks(logger, {});
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result!)).toEqual([]);
  });

  it('returns all tasks as JSON', async () => {
    const tasks = [
      { id: '1', task: 'task 1', type: 'reminder', cronExpression: '0 9 * * *' },
      { id: '2', task: 'task 2', type: 'scheduled_task', cronExpression: '0 10 * * 1' },
    ];
    mockRepo.getAll.mockReturnValue(tasks);
    const result = await listTasks(logger, {});
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result!)).toEqual(tasks);
  });

  it('toolName is list_tasks', async () => {
    mockRepo.getAll.mockReturnValue([]);
    const result = await listTasks(logger, {});
    expect(result.toolName).toBe('list_tasks');
  });

  it('returns error when repo throws', async () => {
    mockRepo.getAll.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await listTasks(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
    expect(result.toolName).toBe('list_tasks');
  });
});
