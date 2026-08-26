import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unlearnSticker } from './index';
import type { ILogger, IStickerRulesGateway } from '../contracts';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeGateway(overrides: Partial<IStickerRulesGateway> = {}): IStickerRulesGateway {
  return {
    save: vi.fn(),
    getById: vi.fn(),
    deleteById: vi.fn(),
    ...overrides,
  };
}

describe('unlearnSticker tool', () => {
  let gateway: IStickerRulesGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = makeGateway();
  });

  it('returns error when id is missing', async () => {
    const result = await unlearnSticker(logger, {}, { channel: 'whatsapp' }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when channel is missing', async () => {
    const result = await unlearnSticker(logger, { id: 'sr1' }, {}, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing channel');
  });

  it('returns error when no learned sticker matches the id', async () => {
    gateway = makeGateway({ getById: vi.fn().mockReturnValue(null) });

    const result = await unlearnSticker(logger, { id: 'missing' }, { channel: 'whatsapp' }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No learned sticker found');
    expect(gateway.deleteById).not.toHaveBeenCalled();
  });

  it('returns error when the sticker was learned on a different channel', async () => {
    gateway = makeGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', channel: 'telegram' }) });

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('telegram');
    expect(gateway.deleteById).not.toHaveBeenCalled();
  });

  it('deletes the sticker rule and returns success', async () => {
    gateway = makeGateway({
      getById: vi.fn().mockReturnValue({ id: 'sr1', channel: 'whatsapp' }),
      deleteById: vi.fn().mockReturnValue(true),
    });

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' }, gateway);

    expect(gateway.deleteById).toHaveBeenCalledWith('sr1');
    expect(result.success).toBe(true);
    expect(result.silent).toBe(false);
    expect(JSON.parse(result.result!)).toEqual({ id: 'sr1' });
  });

  it('returns error when the gateway throws', async () => {
    gateway = makeGateway({
      getById: vi.fn().mockReturnValue({ id: 'sr1', channel: 'whatsapp' }),
      deleteById: vi.fn(() => { throw new Error('db fail'); }),
    });

    const result = await unlearnSticker(logger, { id: 'sr1' }, { channel: 'whatsapp' }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
  });
});
