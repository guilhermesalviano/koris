import { describe, expect, it, vi } from 'vitest';
import { ChannelsManager, type ChannelDefinition } from '.';

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

describe('channels', () => {
  it('uses injected channel plugins', async () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const definition: ChannelDefinition = {
      name: 'telegram',
      enabled: () => true,
      start,
      sendMessage,
    };
    const logger = createLogger();
    const agent = { handle: vi.fn() };
    const channels = new ChannelsManager(logger, agent, [definition]);

    channels.startAll();
    await channels.sendMessage('telegram', '123', 'hello');
    channels.stopAll();

    expect(start).toHaveBeenCalledWith(logger, agent);
    expect(sendMessage).toHaveBeenCalledWith(logger, '123', 'hello');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('delegates sendSticker to the channel definition', async () => {
    const sendSticker = vi.fn().mockResolvedValue(undefined);
    const definition: ChannelDefinition = {
      name: 'whatsapp',
      enabled: () => true,
      start: vi.fn(),
      sendSticker,
    };
    const logger = createLogger();
    const agent = { handle: vi.fn() };
    const channels = new ChannelsManager(logger, agent, [definition]);

    await channels.sendSticker('whatsapp', '123', { data: 'aGVsbG8=', mimeType: 'image/webp' });

    expect(sendSticker).toHaveBeenCalledWith(logger, '123', { data: 'aGVsbG8=', mimeType: 'image/webp' });
  });

  it('rejects sendSticker when the channel does not support it', async () => {
    const definition: ChannelDefinition = {
      name: 'telegram',
      enabled: () => true,
      start: vi.fn(),
    };
    const channels = new ChannelsManager(createLogger(), { handle: vi.fn() }, [definition]);

    await expect(
      channels.sendSticker('telegram', '123', { data: 'aGVsbG8=' }),
    ).rejects.toThrow('does not support sending stickers');
  });
});
