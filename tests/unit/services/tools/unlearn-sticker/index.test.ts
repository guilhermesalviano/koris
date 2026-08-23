import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  getById: vi.fn(),
  deleteById: vi.fn(),
}));

vi.mock('../../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/repositories/sticker-rules', () => ({
  StickerRulesRepositoryFactory: { create: vi.fn().mockReturnValue(mockRepo) },
}));

import { unlearnSticker } from '../../../../../src/services/tools/unlearn-sticker';
import type { ILogger } from '../../../../../src/infrastructure/logger';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('unlearnSticker tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when id is missing', async () => {
    const result = await unlearnSticker(logger, {}, { channel: 'whatsapp' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when channel is missing', async () => {
    const result = await unlearnSticker(logger, { id: 'sr1' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing channel');
  });

  it('returns error when no learned sticker matches the id', async () => {
    mockRepo.getById.mockReturnValue(null);

    const result = await unlearnSticker(logger, { id: 'missing' }, { channel: 'whatsapp' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No learned sticker found');
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
  });

  it('returns error when the sticker was learned on a different channel', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', channel: 'telegram' });

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('telegram');
    expect(mockRepo.deleteById).not.toHaveBeenCalled();
  });

  it('deletes the sticker rule and returns success', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', channel: 'whatsapp' });
    mockRepo.deleteById.mockReturnValue(true);

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' });

    expect(mockRepo.deleteById).toHaveBeenCalledWith('sr1');
    expect(result.success).toBe(true);
    expect(result.silent).toBe(false);
    expect(JSON.parse(result.result!)).toEqual({ id: 'sr1' });
  });

  it('returns error when the repository throws', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', channel: 'whatsapp' });
    mockRepo.deleteById.mockImplementation(() => {
      throw new Error('db fail');
    });

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
