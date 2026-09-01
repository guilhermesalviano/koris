import { describe, it, expect, vi, beforeEach } from 'vitest';
import { learnSticker, create } from './index';
import type { ILogger, IStickerRulesGateway, StickerReference, ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

function makeReference(overrides: Partial<StickerReference> = {}): StickerReference {
  return {
    key: { remoteJid: 'jid@s.whatsapp.net', id: 'STANZA_1', participant: 'jid@s.whatsapp.net', fromMe: false },
    message: { stickerMessage: { mimetype: 'image/webp' } },
    mimeType: 'image/webp',
    ...overrides,
  };
}

function makeGateway(overrides: Partial<IStickerRulesGateway> = {}): IStickerRulesGateway {
  return {
    save: vi.fn(),
    getById: vi.fn(),
    deleteById: vi.fn(),
    ...overrides,
  };
}

describe('learnSticker tool', () => {
  let gateway: IStickerRulesGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = makeGateway();
  });

  it('returns error when description is missing', async () => {
    const result = await learnSticker(logger, {}, { stickers: [makeReference()] }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
  });

  it('returns error when the current message has no sticker', async () => {
    const result = await learnSticker(logger, { description: 'when happy' }, { stickers: [] }, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No sticker found');
  });

  it('returns error when context has no stickers field at all', async () => {
    const result = await learnSticker(logger, { description: 'when happy' }, undefined, gateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No sticker found');
  });

  it('returns error when channel is missing', async () => {
    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { stickers: [makeReference()] },
      gateway,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('channel');
  });

  it('saves the sticker rule and returns success', async () => {
    gateway = makeGateway({ save: vi.fn().mockReturnValue({ id: 'sr1', description: 'when happy', reference: makeReference(), channel: 'whatsapp' }) });
    const reference = makeReference();

    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { channel: 'whatsapp', stickers: [reference] },
      gateway,
    );

    expect(gateway.save).toHaveBeenCalledWith({
      description: 'when happy',
      reference,
      channel: 'whatsapp',
    });
    expect(result.success).toBe(true);
    expect(result.silent).toBe(false);
    expect(JSON.parse(result.result!)).toEqual({
      id: 'sr1',
      description: 'when happy',
    });
  });

  it('returns error when the gateway throws', async () => {
    gateway = makeGateway({ save: vi.fn(() => { throw new Error('db fail'); }) });

    const result = await learnSticker(
      logger,
      { description: 'when happy' },
      { channel: 'whatsapp', stickers: [makeReference()] },
      gateway,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('db fail');
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
