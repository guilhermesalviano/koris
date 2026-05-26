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

import { deleteTask } from '../../../../../src/services/tools/task/delete';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('deleteTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when id is missing', async () => {
    const result = await deleteTask(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when task is not found', async () => {
    mockRepo.deleteById.mockReturnValue(false);
    const result = await deleteTask(logger, { id: 'no-such-id' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns success when task is deleted', async () => {
    mockRepo.deleteById.mockReturnValue(true);
    const result = await deleteTask(logger, { id: 'hb-1' });
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('delete_task');
  });

  it('result contains the deleted id', async () => {
    mockRepo.deleteById.mockReturnValue(true);
    const result = await deleteTask(logger, { id: 'hb-1' });
    const parsed = JSON.parse(result.result!);
    expect(parsed.deleted_id).toBe('hb-1');
  });

  it('calls repo.deleteById with the provided id', async () => {
    mockRepo.deleteById.mockReturnValue(true);
    await deleteTask(logger, { id: 'hb-42' });
    expect(mockRepo.deleteById).toHaveBeenCalledWith('hb-42');
  });

  it('returns error when repo throws', async () => {
    mockRepo.deleteById.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await deleteTask(logger, { id: 'hb-1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
