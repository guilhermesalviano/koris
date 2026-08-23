import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  save: vi.fn(),
}));

vi.mock('../../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/repositories/sticker-rules', () => ({
  StickerRulesRepositoryFactory: { create: vi.fn().mockReturnValue(mockRepo) },
}));

import { learnSticker } from '../../../../../src/services/tools/learn-sticker';
import type { ILogger } from '../../../../../src/infrastructure/logger';
import type { StickerReference } from '../../../../../plugins/contracts';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeReference(overrides: Partial<StickerReference> = {}): StickerReference {
  return {
    key: { remoteJid: 'jid@s.whatsapp.net', id: 'STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
    message: { stickerMessage: { mimetype: 'image/webp' } },
    mimeType: 'image/webp',
    ...overrides,
  };
}

describe('learnSticker tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when description is missing', async () => {
    const result = await learnSticker(logger, {}, { stickers: [makeReference()] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
  });

  it('returns error when the current message has no sticker', async () => {
    const result = await learnSticker(logger, { description: 'when happy' }, { stickers: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No sticker found');
  });

  it('returns error when context has no stickers field at all', async () => {
    const result = await learnSticker(logger, { description: 'when happy' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No sticker found');
  });

  it('returns error when channel is missing', async () => {
    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { stickers: [makeReference()] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('saves the sticker rule and returns success', async () => {
    mockRepo.save.mockReturnValue({ id: 'sr1', description: 'when happy' });
    const reference = makeReference();

    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { channel: 'whatsapp', stickers: [reference] },
    );

    expect(mockRepo.save).toHaveBeenCalledWith({
      description: 'when happy',
      reference,
      channel: 'whatsapp',
    });
    expect(result.success).toBe(true);
    expect(result.silent).toBe(true);
    expect(JSON.parse(result.result!)).toEqual({
      id: 'sr1',
      description: 'when happy',
    });
  });

  it('returns error when the repository throws', async () => {
    mockRepo.save.mockImplementation(() => {
      throw new Error('db fail');
    });

    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { channel: 'whatsapp', stickers: [makeReference()] },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
