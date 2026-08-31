import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSticker, create } from './index';
import type { IChannelsGateway, ILogger, IStickerRulesGateway, StickerReference, ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeReference(): StickerReference {
  return {
    key: { remoteJid: 'jid@s.whatsapp.net', id: 'STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
    message: { stickerMessage: { mimetype: 'image/webp' } },
    mimeType: 'image/webp',
  };
}

function makeStickerRulesGateway(overrides: Partial<IStickerRulesGateway> = {}): IStickerRulesGateway {
  return {
    save: vi.fn(),
    getById: vi.fn(),
    deleteById: vi.fn(),
    ...overrides,
  };
}

function makeChannelsGateway(overrides: Partial<IChannelsGateway> = {}): IChannelsGateway {
  return {
    sendMessage: vi.fn(),
    sendSticker: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('sendSticker tool', () => {
  let stickerRules: IStickerRulesGateway;
  let channels: IChannelsGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    stickerRules = makeStickerRulesGateway();
    channels = makeChannelsGateway();
  });

  it('returns error when id is missing', async () => {
    const result = await sendSticker(logger, {}, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toContain('id');
  });

  it('returns error when channel/target are unavailable', async () => {
    const result = await sendSticker(logger, { id: 'sr1' }, {}, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing channel/target');
  });

  it('returns error when no learned sticker matches the id', async () => {
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue(null) });

    const result = await sendSticker(logger, { id: 'missing' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No learned sticker found');
  });

  it('returns error when the channel manager is not running', async () => {
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'whatsapp' }) });
    channels = makeChannelsGateway({ sendSticker: vi.fn().mockRejectedValue(new Error('Outbound messaging is not available: no channel manager is running.')) });

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('returns error when the sticker was learned on a different channel', async () => {
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'telegram' }) });

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toContain('telegram');
    expect(channels.sendSticker).not.toHaveBeenCalled();
  });

  it('sends the sticker through the channel manager', async () => {
    const reference = makeReference();
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', reference, channel: 'whatsapp', description: 'when the user is happy' }) });

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(channels.sendSticker).toHaveBeenCalledWith('whatsapp', '123', reference);
    expect(result.success).toBe(true);
    expect(result.silent).toBe(true);
    expect(JSON.parse(result.result!)).toEqual({
      id: 'sr1',
      channel: 'whatsapp',
      target: '123',
    });
  });

  it('an explicit target argument overrides the context target', async () => {
    const reference = makeReference();
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', reference, channel: 'whatsapp' }) });

    await sendSticker(logger, { id: 'sr1', target: '999' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(channels.sendSticker).toHaveBeenCalledWith('whatsapp', '999', reference);
  });

  it('returns error when the channel manager throws', async () => {
    stickerRules = makeStickerRulesGateway({ getById: vi.fn().mockReturnValue({ id: 'sr1', reference: makeReference(), channel: 'whatsapp' }) });
    channels = makeChannelsGateway({ sendSticker: vi.fn().mockRejectedValue(new Error('socket closed')) });

    const result = await sendSticker(logger, { id: 'sr1' }, { channel: 'whatsapp', target: '123' }, stickerRules, channels);

    expect(result.success).toBe(false);
    expect(result.error).toBe('socket closed');
  });
});

describe('create', () => {
  function register(isEnabled: () => boolean): ToolDefinition {
    const context = { pluginEnablement: { isEnabled } } as unknown as ToolPluginContext;
    let registered: ToolDefinition | undefined;
    const fakeRegistry = {
      extend: vi.fn((_point, value: ToolDefinition) => { registered = value; }),
    } as unknown as PluginRegistry;
    create(context).setup(fakeRegistry);
    return registered!;
  }

  it('is enabled when trusted, stickers are enabled, and the plugin is enabled', () => {
    const definition = register(() => true);
    expect(definition.enabled({ trusted: true })).toBe(true);
  });

  it('is disabled when the plugin is administratively disabled, even when trusted and stickers are enabled', () => {
    const definition = register(() => false);
    expect(definition.enabled({ trusted: true })).toBe(false);
  });
});
