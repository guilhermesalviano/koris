import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelHandlerFactory, IMessageGateway, ILogger } from '../contracts';
import type { WAMessage } from '@whiskeysockets/baileys';

// This suite proves the whatsapp plugin is testable with zero core imports:
// the only non-relative imports below are the vendor SDK (mocked) and the
// plugin's own `../contracts` types.

type Listener = (data: unknown) => void;

const listeners = new Map<string, Listener>();

const fakeSock = {
  user: { id: '5511999998888:7@s.whatsapp.net', lid: '162157312364643:7@lid' },
  sendMessage: vi.fn().mockResolvedValue(undefined),
  sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
  groupMetadata: vi.fn().mockResolvedValue({ subject: 'Family' }),
  onWhatsApp: vi.fn().mockResolvedValue(undefined),
  end: vi.fn(),
  ev: {
    on: vi.fn((event: string, handler: Listener) => {
      listeners.set(event, handler);
    }),
    removeAllListeners: vi.fn(),
  },
};

const downloadMediaMessage = vi.fn(async () => Buffer.from('fake-bytes'));

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => fakeSock),
  useMultiFileAuthState: vi.fn(async () => ({ state: {}, saveCreds: vi.fn() })),
  DisconnectReason: { loggedOut: 401 },
  downloadMediaMessage: (...args: unknown[]) => downloadMediaMessage(...(args as [])),
}));

vi.mock('qrcode-terminal', () => ({ generate: vi.fn() }));

import { WhatsAppChannelFactory, configureWhatsAppRuntime, _resetWhatsAppDedupeForTesting, create } from './index';
import { _resetContactNamesForTesting } from './contact-names';
import { whatsappState } from './state';
import type { ChannelDefinition } from '../contracts';
import type { PluginRegistry } from '../../registry';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

interface CapturedCall {
  target: string;
  message: Record<string, unknown>;
}

function makeChannelHandlerFactory(replyText: string): { factory: IChannelHandlerFactory; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const factory: IChannelHandlerFactory = {
    create: vi.fn((options) => ({
      handle: vi.fn(async (target: string, message: Record<string, unknown>) => {
        calls.push({ target, message });
        await options.reply.sendText(target, replyText);
        return true;
      }),
    })),
  };
  return { factory, calls };
}

function waMessage(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'MSG1' },
    pushName: 'Guilherme',
    messageTimestamp: 1_700_000_000,
    ...overrides,
  } as WAMessage;
}

const BOT_NUMBER = '5511999998888';

async function start(replyText: string, opts: { allowUntrusted?: boolean; whitelist?: string; botNumber?: string } = {}) {
  const { factory, calls } = makeChannelHandlerFactory(replyText);
  const botNumber = opts.botNumber ?? BOT_NUMBER;
  configureWhatsAppRuntime({
    channelHandler: factory,
    config: {
      authFolder: '.test-wa-auth',
      whitelist: opts.whitelist ?? '',
      botNumber,
      allowUnlistedSenders: opts.allowUntrusted ?? true,
    },
  });

  const gateway: IMessageGateway = { handle: vi.fn() };
  await WhatsAppChannelFactory.start({
    authFolder: '.test-wa-auth',
    botNumber,
    gateway,
    logger: makeLogger(),
  });

  return { calls, gateway };
}

async function emitUpsert(messages: WAMessage[]) {
  const handler = listeners.get('messages.upsert');
  if (!handler) throw new Error('messages.upsert listener was never registered');
  handler({ messages, type: 'notify' });
  // handleInboundMessage is dispatched via `void ...catch(...)` — flush microtasks.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('whatsapp plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    _resetWhatsAppDedupeForTesting();
    _resetContactNamesForTesting();
    // session-derived LID leaks across tests otherwise (module singleton)
    whatsappState.botLid = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles a plain text DM and replies through the socket', async () => {
    const { calls } = await start('pong');

    await emitUpsert([waMessage({ message: { conversation: 'hello there' } })]);

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe('5511999999999@s.whatsapp.net');
    expect(calls[0].message).toMatchObject({ text: 'hello there', isGroup: false });
    expect(fakeSock.sendMessage).toHaveBeenCalledWith('5511999999999@s.whatsapp.net', { text: 'pong' });
  });

  it('sends to a loosely-formatted number by canonicalizing it through onWhatsApp', async () => {
    await start('n/a');
    fakeSock.onWhatsApp.mockResolvedValueOnce([{ jid: '5511999999999@s.whatsapp.net', exists: true }]);

    await WhatsAppChannelFactory.sendText('11 9 9999-9999', 'oi');

    expect(fakeSock.onWhatsApp).toHaveBeenCalledWith(
      '11999999999', '511999999999', '5511999999999', '55111999999999',
    );
    expect(fakeSock.sendMessage).toHaveBeenCalledWith('5511999999999@s.whatsapp.net', { text: 'oi' });
  });

  it('splits a reply longer than the WhatsApp chunk limit into multiple sends', async () => {
    const longReply = 'a'.repeat(9_000);
    await start(longReply);

    await emitUpsert([waMessage({ message: { conversation: 'give me a long answer' } })]);

    expect(fakeSock.sendMessage.mock.calls.length).toBeGreaterThan(1);
    for (const call of fakeSock.sendMessage.mock.calls) {
      const [, content] = call as [string, { text: string }];
      expect(content.text.length).toBeLessThanOrEqual(4_000);
    }
  });

  it('downloads an image message and forwards it as an attachment', async () => {
    const { calls } = await start('got the image');

    await emitUpsert([
      waMessage({
        message: { imageMessage: { caption: 'check this out', mimetype: 'image/jpeg' } },
      }),
    ]);

    expect(downloadMediaMessage).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const images = calls[0].message.images as Array<{ data: string; mimeType?: string }>;
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe('image/jpeg');
    expect(images[0].data).toBe(Buffer.from('fake-bytes').toString('base64'));
    expect(calls[0].message.text).toBe('check this out');
  });

  it('drops a top-level sticker message (only quoted stickers are handled)', async () => {
    // Realistic "unsupported" case: extractText/extractImage/extractQuotedSticker
    // all return null for a plain (non-quoted) sticker — a message that is
    // *itself* a sticker, not a reply to one, is silently dropped today.
    const { calls } = await start('should not be sent');

    await emitUpsert([
      waMessage({ message: { stickerMessage: { mimetype: 'image/webp' } } }),
    ]);

    expect(calls).toHaveLength(0);
    expect(fakeSock.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a group message that does not mention the bot', async () => {
    const { calls } = await start('should not be sent');

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG2' },
        message: { conversation: 'hello everyone' },
      }),
    ]);

    expect(calls).toHaveLength(0);
    expect(fakeSock.sendMessage).not.toHaveBeenCalled();
  });

  it('processes a group message that mentions the bot number as text and resolves the group name', async () => {
    const { calls } = await start('pong');

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG3' },
        message: { conversation: `hey @${BOT_NUMBER} help me` },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ isGroup: true, mentionsBot: true, groupName: 'Family' });
  });

  it('processes a group message that mentions the bot via contextInfo.mentionedJid', async () => {
    const { calls } = await start('pong');

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG3b' },
        message: {
          extendedTextMessage: {
            text: 'hey help me',
            contextInfo: { mentionedJid: [`${BOT_NUMBER}@s.whatsapp.net`] },
          },
        },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ isGroup: true, mentionsBot: true });
  });

  it('auto-detects the bot number from the live socket when config leaves it blank', async () => {
    const { calls } = await start('pong', { botNumber: '' });

    // Baileys reports the linked account on `connection === 'open'`.
    const connUpdate = listeners.get('connection.update');
    if (!connUpdate) throw new Error('connection.update listener was never registered');
    connUpdate({ connection: 'open' });

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG3c' },
        message: { conversation: `hey @${BOT_NUMBER} help me` },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ isGroup: true, mentionsBot: true });
  });

  it('recognizes a mention by the bot LID in a LID-addressed group and strips the token', async () => {
    const { calls } = await start('pong', { botNumber: '5562936181410' });

    // Baileys surfaces the bot's LID on `connection === 'open'`.
    const connUpdate = listeners.get('connection.update');
    if (!connUpdate) throw new Error('connection.update listener was never registered');
    connUpdate({ connection: 'open' });

    await emitUpsert([
      waMessage({
        key: { remoteJid: '120363407821582446@g.us', fromMe: false, id: 'MSG3d', participantAlt: '5511999999999@s.whatsapp.net', addressingMode: 'lid' },
        message: {
          extendedTextMessage: {
            text: '@162157312364643 eai mano',
            contextInfo: { mentionedJid: ['162157312364643@lid'] },
          },
        },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ isGroup: true, mentionsBot: true, text: 'eai mano' });
  });

  it('rewrites a third-party @-mention to @<name> from a previously-seen pushName, bot token stripped', async () => {
    const { calls } = await start('pong');
    const group = '120363407821582446@g.us';

    // A plain group message (not mentioning the bot) — dropped by the gate, but
    // its sender's name is cached for later.
    await emitUpsert([
      waMessage({
        key: { remoteJid: group, fromMe: false, id: 'M-name', participant: '5511999999999@s.whatsapp.net' },
        pushName: 'João',
        message: { conversation: 'oi pessoal' },
      }),
    ]);
    expect(calls).toHaveLength(0);

    // Now someone mentions both João and the bot.
    await emitUpsert([
      waMessage({
        key: { remoteJid: group, fromMe: false, id: 'M-mention', participant: '5599999999999@s.whatsapp.net' },
        pushName: 'Guilherme',
        message: {
          extendedTextMessage: {
            text: `@5511999999999 e @${BOT_NUMBER} vejam isso`,
            contextInfo: { mentionedJid: ['5511999999999@s.whatsapp.net', `${BOT_NUMBER}@s.whatsapp.net`] },
          },
        },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({
      mentionsBot: true,
      text: '@João e vejam isso',
    });
  });

  it('leaves a @-mention of someone who has not spoken as the raw number', async () => {
    const { calls } = await start('pong');

    await emitUpsert([
      waMessage({
        key: { remoteJid: '120363407821582446@g.us', fromMe: false, id: 'M-unknown', participant: '5599999999999@s.whatsapp.net' },
        pushName: 'Guilherme',
        message: {
          extendedTextMessage: {
            text: `@5511999999999 e @${BOT_NUMBER} vejam`,
            contextInfo: { mentionedJid: ['5511999999999@s.whatsapp.net', `${BOT_NUMBER}@s.whatsapp.net`] },
          },
        },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message.text).toBe('@5511999999999 e vejam');
  });

  it('falls back to a group-participant name when the mentioned user has not spoken', async () => {
    const { calls } = await start('pong');
    const group = '120363111111111111@g.us';

    // Nobody has spoken, but the group metadata carries a display name for them.
    fakeSock.groupMetadata.mockResolvedValueOnce({
      subject: 'Squad',
      participants: [{ id: '5511999999999@s.whatsapp.net', notify: 'João' }],
    });

    await emitUpsert([
      waMessage({
        key: { remoteJid: group, fromMe: false, id: 'M-part', participant: '5599999999999@s.whatsapp.net' },
        pushName: 'Guilherme',
        message: {
          extendedTextMessage: {
            text: `@5511999999999 e @${BOT_NUMBER} vejam`,
            contextInfo: { mentionedJid: ['5511999999999@s.whatsapp.net', `${BOT_NUMBER}@s.whatsapp.net`] },
          },
        },
      }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ groupName: 'Squad', text: '@João e vejam' });
  });

  it('denies an untrusted sender instead of reaching the channel handler', async () => {
    const { calls } = await start('pong', { allowUntrusted: false, whitelist: '' });

    await emitUpsert([waMessage({ message: { conversation: 'hello' } })]);

    expect(calls).toHaveLength(0);
    expect(fakeSock.sendMessage).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      { text: expect.stringContaining("You're not authorized") },
    );
  });

  // No approval mechanism exists in this plugin today (see FINDINGS.md §3.5) —
  // unlike Telegram's dead `sendWithApproval`, there's no approval-shaped code
  // here to characterize. Recorded so Phase 4 knows the numbered-text-prompt
  // flow it introduces is new behavior, not a move.

  it('drops a replayed message.upsert with a previously-seen key.id', async () => {
    const { calls } = await start('pong');

    await emitUpsert([waMessage({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'DUP-1' }, message: { conversation: 'first' } })]);
    await emitUpsert([waMessage({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'DUP-1' }, message: { conversation: 'replayed after reconnect' } })]);

    expect(calls).toHaveLength(1);
    expect(calls[0].message.text).toBe('first');
  });

  it('processes two messages with different ids from the same sender', async () => {
    const { calls } = await start('pong');

    await emitUpsert([waMessage({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'A' }, message: { conversation: 'one' } })]);
    await emitUpsert([waMessage({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'B' }, message: { conversation: 'two' } })]);

    expect(calls).toHaveLength(2);
  });

  it('detaches all listeners before ending the socket on stop(), so end() cannot trigger a reconnect', async () => {
    const { factory } = makeChannelHandlerFactory('n/a');
    configureWhatsAppRuntime({ channelHandler: factory, config: { authFolder: '.test-wa-auth', whitelist: '', botNumber: '5511999998888', allowUnlistedSenders: true } });
    const gateway = { handle: vi.fn() };
    const { stop } = await WhatsAppChannelFactory.start({ authFolder: '.test-wa-auth', botNumber: '5511999998888', gateway, logger: makeLogger() });

    stop();

    expect(fakeSock.ev.removeAllListeners).toHaveBeenCalledWith('creds.update');
    expect(fakeSock.ev.removeAllListeners).toHaveBeenCalledWith('connection.update');
    expect(fakeSock.ev.removeAllListeners).toHaveBeenCalledWith('messages.upsert');
    expect(fakeSock.end).toHaveBeenCalledWith(undefined);

    const lastRemoveListenersCallOrder = Math.max(...fakeSock.ev.removeAllListeners.mock.invocationCallOrder);
    const endCallOrder = fakeSock.end.mock.invocationCallOrder[0];
    expect(lastRemoveListenersCallOrder).toBeLessThan(endCallOrder);
  });

  it('declares capabilities matching the current (non-streaming) implementation', () => {
    let registered: ChannelDefinition | undefined;
    const fakeRegistry = { extend: vi.fn((_point, value: ChannelDefinition) => { registered = value; }) } as unknown as PluginRegistry;

    const plugin = create(
      {
        logger: makeLogger(),
        gateway: { handle: vi.fn() },
        channelHandler: makeChannelHandlerFactory('n/a').factory,
        pluginEnablement: { isEnabled: () => true },
      },
      { authFolder: '.test-wa-auth', whitelist: '', botNumber: '5511999998888', allowUnlistedSenders: true },
    );
    plugin.setup(fakeRegistry);

    expect(registered?.capabilities).toEqual({
      streaming: false,
      markdown: false,
      interactive: false,
      maxMessageChars: 4_000,
    });
  });

  it('is disabled when administratively disabled', () => {
    let registered: ChannelDefinition | undefined;
    const fakeRegistry = { extend: vi.fn((_point, value: ChannelDefinition) => { registered = value; }) } as unknown as PluginRegistry;

    const plugin = create(
      {
        logger: makeLogger(),
        gateway: { handle: vi.fn() },
        channelHandler: makeChannelHandlerFactory('n/a').factory,
        pluginEnablement: { isEnabled: () => false },
      },
      { authFolder: '.test-wa-auth', whitelist: '', botNumber: '5511999998888', allowUnlistedSenders: true },
    );
    plugin.setup(fakeRegistry);

    expect(registered?.enabled()).toBe(false);
  });
});
