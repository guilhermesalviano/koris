import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock('../../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/repositories/sticker-rules', () => ({
  StickerRulesRepositoryFactory: { create: vi.fn().mockReturnValue(mockRepo) },
}));

vi.mock('../../../../../src/channels', () => ({
  ChannelsSingleton: {
    getExistingInstance: vi.fn(),
  },
}));

import { sendSticker } from '../../../../../src/services/tools/send-sticker';
import { ChannelsSingleton } from '../../../../../src/channels';
import type { ILogger } from '../../../../../src/infrastructure/logger';
import type { StickerReference } from '../../../../../plugins/contracts';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
const channelsManager = { sendSticker: vi.fn() };

function makeReference(): StickerReference {
  return {
    key: { remoteJid: 'jid@s.whatsapp.net', id: 'STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
    message: { stickerMessage: { mimetype: 'image/webp' } },
    mimeType: 'image/webp',
  };
}

describe('sendSticker tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ChannelsSingleton.getExistingInstance).mockReturnValue(channelsManager as never);
  });

  it('returns error when id is missing', async () => {
    const result = await sendSticker(logger, {}, { channel: 'whatsapp', target: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when channel/target are unavailable', async () => {
    const result = await sendSticker(logger, { id: 'sr1' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing channel/target');
  });

  it('returns error when no learned sticker matches the id', async () => {
    mockRepo.getById.mockReturnValue(null);

    const result = await sendSticker(logger, { id: 'missing' }, { channel: 'whatsapp', target: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No learned sticker found');
  });

  it('returns error when the channel manager is not running', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'whatsapp' });
    vi.mocked(ChannelsSingleton.getExistingInstance).mockReturnValue(null);

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('returns error when the sticker was learned on a different channel', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'telegram' });

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('telegram');
    expect(channelsManager.sendSticker).not.toHaveBeenCalled();
  });

  it('sends the sticker through the channel manager', async () => {
    const reference = makeReference();
    mockRepo.getById.mockReturnValue({ id: 'sr1', reference, channel: 'whatsapp' });
    channelsManager.sendSticker.mockResolvedValue(undefined);

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' });

    expect(channelsManager.sendSticker).toHaveBeenCalledWith('whatsapp', '123', reference);
    expect(result.success).toBe(true);
    expect(JSON.parse(result.result!)).toEqual({ id: 'sr1', channel: 'whatsapp', target: '123' });
  });

  it('an explicit target argument overrides the context target', async () => {
    const reference = makeReference();
    mockRepo.getById.mockReturnValue({ id: 'sr1', reference, channel: 'whatsapp' });
    channelsManager.sendSticker.mockResolvedValue(undefined);

    await sendSticker(logger, { id: 'sr1', target: '999' }, { channel: 'whatsapp', target: '123' });

    expect(channelsManager.sendSticker).toHaveBeenCalledWith('whatsapp', '999', reference);
  });

  it('returns error when the channel manager throws', async () => {
    mockRepo.getById.mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'whatsapp' });
    channelsManager.sendSticker.mockRejectedValue(new Error('socket closed'));

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('socket closed');
  });
});
