import { describe, expect, it, vi } from 'vitest';
import { ChannelHandlerFactory } from '../../../src/channels/handler';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../src/constants/thinking';
import type { InboundChannelMessage } from '../../../src/channels/handler';
import { config } from '../../../src/config';

const MENTION_ID = '162157312364643';

function makeHandler() {
  const gateway = { handle: vi.fn() };
  const reply = {
    sendText: vi.fn(),
    sendError: vi.fn(),
  };
  const handler = ChannelHandlerFactory.create({
    channel: 'test-channel',
    gateway,
    reply,
    mentionId: MENTION_ID,
  });
  return { handler, gateway, reply };
}

function message(overrides: Partial<InboundChannelMessage> = {}): InboundChannelMessage {
  return {
    text: 'hello',
    isGroup: false,
    mentionsBot: false,
    isTrustedSender: false,
    ...overrides,
  };
}

async function* createResponseStream(): AsyncGenerator<string> {
  yield THINK_START;
  yield 'internal reasoning';
  yield THINK_END;
  yield RESPONSE_ANCHOR;
  yield 'Visible reply';
}

describe('channels/handler', () => {
  it('skips group messages that do not mention the bot', async () => {
    const { handler, gateway, reply } = makeHandler();

    const processed = await handler.handle('group@g.us', message({ isGroup: true, mentionsBot: false }));

    expect(processed).toBe(false);
    expect(gateway.handle).not.toHaveBeenCalled();
    expect(reply.sendText).not.toHaveBeenCalled();
  });

  it('processes group messages that mention the bot', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    const processed = await handler.handle('group@g.us', message({ isGroup: true, mentionsBot: true }));

    expect(processed).toBe(true);
    expect(gateway.handle).toHaveBeenCalled();
    expect(reply.sendText).toHaveBeenCalledWith('group@g.us', 'pong');
  });

  it('prefixes the prompt with the sender name', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ senderName: 'guilherme', text: 'hi' }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: direct (untrusted sender). Sender: guilherme. Message: hi', images: undefined },
      'jid',
      { channel: 'test-channel', toolsEnabled: false, learnedSkillsEnabled: false, stickersEnabled: true },
    );
  });

  it('includes quoted text in the prompt', async () => {
    const { handler, gateway } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ senderName: 'guilherme', text: 'hi', quotedText: 'the original message' }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: direct (untrusted sender). Sender: guilherme. Quoting: "the original message" Message: hi', images: undefined },
      'jid',
      expect.any(Object),
    );
  });

  it('notes a quoted image in the prompt when there is no quoted text', async () => {
    const { handler, gateway } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({
      senderName: 'guilherme',
      text: 'hi',
      images: [{ data: 'abc', mimeType: 'image/jpeg', source: 'quoted' }],
    }));

    expect(gateway.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '[Context] Chat: direct (untrusted sender). Sender: guilherme. Quoting an image. Message: hi',
      }),
      'jid',
      expect.any(Object),
    );
  });

  it('does not prefix the sender name when prefixSenderName is disabled', async () => {
    const gateway = { handle: vi.fn().mockResolvedValue('pong') };
    const reply = { sendText: vi.fn(), sendError: vi.fn() };
    const handler = ChannelHandlerFactory.create({
      channel: 'test-channel',
      gateway,
      reply,
      prefixSenderName: false,
    });

    await handler.handle('jid', message({ senderName: 'guilherme', text: 'hi' }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: direct (untrusted sender). Message: hi', images: undefined },
      'jid',
      expect.any(Object),
    );
  });

  it('prefixes group messages with the group name', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('group@g.us', message({
      isGroup: true,
      mentionsBot: true,
      senderName: 'guilherme',
      groupName: 'Family',
      text: 'hi',
    }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: "Family" (group) (untrusted sender). Sender: guilherme. Message: hi', images: undefined },
      'group@g.us',
      expect.any(Object),
    );
  });

  it('prefixes group messages without a name as bare group', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('group@g.us', message({
      isGroup: true,
      mentionsBot: true,
      senderName: 'guilherme',
      text: 'hi',
    }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: group (untrusted sender). Sender: guilherme. Message: hi', images: undefined },
      'group@g.us',
      expect.any(Object),
    );
  });

  it('does not prefix commands so they still reach the command handler', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ senderName: 'guilherme', text: '/help' }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '/help', images: undefined },
      'jid',
      expect.any(Object),
    );
  });

  it('strips the configured mention from the text', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ text: `hey @${MENTION_ID} help` }));

    expect(gateway.handle).toHaveBeenCalledWith(
      { text: '[Context] Chat: direct (untrusted sender). Message: hey  help', images: undefined },
      'jid',
      expect.any(Object),
    );
  });

  it('enables tools and learned skills only for trusted senders', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ isTrustedSender: true }));

    expect(gateway.handle).toHaveBeenCalledWith(
      expect.anything(),
      'jid',
      { channel: 'test-channel', toolsEnabled: true, learnedSkillsEnabled: true, stickersEnabled: true },
    );
  });

  it('enables sticker tools for untrusted senders when stickers.allow_untrusted is on', async () => {
    const { handler, gateway } = makeHandler();
    gateway.handle.mockResolvedValue('pong');

    await handler.handle('jid', message({ isTrustedSender: false }));

    expect(gateway.handle).toHaveBeenCalledWith(
      expect.anything(),
      'jid',
      expect.objectContaining({ toolsEnabled: false, stickersEnabled: true }),
    );
  });

  it('disables sticker tools for untrusted senders when stickers.allow_untrusted is off', async () => {
    const original = config.STICKERS.ALLOW_UNTRUSTED;
    (config.STICKERS as { ALLOW_UNTRUSTED: boolean }).ALLOW_UNTRUSTED = false;
    try {
      const { handler, gateway } = makeHandler();
      gateway.handle.mockResolvedValue('pong');

      await handler.handle('jid', message({ isTrustedSender: false }));

      expect(gateway.handle).toHaveBeenCalledWith(
        expect.anything(),
        'jid',
        expect.objectContaining({ toolsEnabled: false, stickersEnabled: false }),
      );
    } finally {
      (config.STICKERS as { ALLOW_UNTRUSTED: boolean }).ALLOW_UNTRUSTED = original;
    }
  });

  it('strips think output before replying', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue(createResponseStream());

    await handler.handle('jid', message({}));

    expect(reply.sendText).toHaveBeenCalledWith('jid', 'Visible reply');
  });

  it('coerces non-string non-stream responses with String()', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockResolvedValue(42);

    await handler.handle('jid', message({}));

    expect(reply.sendText).toHaveBeenCalledWith('jid', '42');
  });

  it('sends an error reply when the agent throws', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockRejectedValue(new Error('boom'));

    await handler.handle('jid', message({}));

    expect(reply.sendText).not.toHaveBeenCalled();
    expect(reply.sendError).toHaveBeenCalledWith('jid', '❌ boom');
  });

  it('uses a friendly fallback when the error has no message', async () => {
    const { handler, gateway, reply } = makeHandler();
    gateway.handle.mockRejectedValue('raw failure');

    await handler.handle('jid', message({}));

    expect(reply.sendError).toHaveBeenCalledWith('jid', '❌ Sorry, I ran into an unexpected problem. Could you try again?');
  });
});