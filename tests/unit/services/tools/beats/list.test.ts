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

import { listBeats } from '../../../../../src/services/tools/beats/list';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('listBeats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success with empty list', async () => {
    mockRepo.getAll.mockReturnValue([]);
    const result = await listBeats(logger, {});
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result!)).toEqual([]);
  });

  it('returns all beats as JSON', async () => {
    const beats = [
      { id: '1', beat: 'beat 1', type: 'reminder', cronExpression: '0 9 * * *' },
      { id: '2', beat: 'beat 2', type: 'scheduled_beat', cronExpression: '0 10 * * 1' },
    ];
    mockRepo.getAll.mockReturnValue(beats);
    const result = await listBeats(logger, {});
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result!)).toEqual(beats);
  });

  it('toolName is list_beats', async () => {
    mockRepo.getAll.mockReturnValue([]);
    const result = await listBeats(logger, {});
    expect(result.toolName).toBe('list_beats');
  });

  it('returns error when repo throws', async () => {
    mockRepo.getAll.mockImplementationOnce(() => { throw new Error('db fail'); });
    const result = await listBeats(logger, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
    expect(result.toolName).toBe('list_beats');
  });
});
