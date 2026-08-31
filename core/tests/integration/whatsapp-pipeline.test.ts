import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';

// Pushes realistic Baileys `messages.upsert` shapes through the REAL seam:
// plugin (vendor SDK mocked) -> core ChannelHandler -> core MessageGateway
// (with a fake MainAgent) -> back out through the plugin's real send path.

type Listener = (data: unknown) => void;
const listeners = new Map<string, Listener>();

const fakeSock = {
  sendMessage: vi.fn().mockResolvedValue(undefined),
  sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
  groupMetadata: vi.fn().mockResolvedValue({ subject: 'Family' }),
  end: vi.fn(),
  ev: {
    on: vi.fn((event: string, handler: Listener) => {
      listeners.set(event, handler);
    }),
  },
};

const downloadMediaMessage = vi.fn(async () => Buffer.from('img-bytes'));

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => fakeSock),
  useMultiFileAuthState: vi.fn(async () => ({ state: {}, saveCreds: vi.fn() })),
  DisconnectReason: { loggedOut: 401 },
  downloadMediaMessage: (...args: unknown[]) => downloadMediaMessage(...(args as [])),
}));

vi.mock('qrcode-terminal', () => ({ generate: vi.fn() }));

import { ChannelHandlerFactory } from '../../src/channels/handler';
import { MessageGateway } from '../../src/services/agents/message-gateway';
import type { ILogger } from '../../src/infrastructure/logger';
import { WhatsAppChannelFactory, configureWhatsAppRuntime, _resetWhatsAppDedupeForTesting } from '../../../plugins/channels/whatsapp/index';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeGatewayWithFakeAgent(mainAgentReply: string) {
  const sessionService = { getSession: vi.fn().mockReturnValue({ id: 'session-1' }) };
  const messageService = { getHistory: vi.fn(), getSessionId: vi.fn().mockReturnValue('session-1'), save: vi.fn() };
  const memoryService = { upsert: vi.fn() };
  const mainAgent = { run: vi.fn().mockResolvedValue(mainAgentReply) };

  const gateway = new MessageGateway(
    makeLogger(),
    'whatsapp',
    { resolve: vi.fn().mockReturnValue({ sessionService, messageService, memoryService }) } as never,
    { persistConversation: vi.fn(), summarizeConversation: vi.fn() } as never,
    mainAgent as never,
    { record: vi.fn() } as never,
  );

  return { gateway, mainAgent };
}

function waMessage(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'MSG1' },
    pushName: 'Guilherme',
    messageTimestamp: 1_700_000_000,
    ...overrides,
  } as WAMessage;
}

async function start(mainAgentReply: string) {
  configureWhatsAppRuntime({
    channelHandler: ChannelHandlerFactory,
    config: { authFolder: '.test-wa-auth', whitelist: '', mentionId: 'korisbot', allowUnlistedSenders: true },
  });

  const { gateway, mainAgent } = makeGatewayWithFakeAgent(mainAgentReply);
  await WhatsAppChannelFactory.start({ authFolder: '.test-wa-auth', mentionId: 'korisbot', gateway, logger: makeLogger() });
  return { mainAgent };
}

async function emitUpsert(messages: WAMessage[]) {
  const handler = listeners.get('messages.upsert');
  if (!handler) throw new Error('messages.upsert listener was never registered');
  handler({ messages, type: 'notify' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('whatsapp end-to-end pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    _resetWhatsAppDedupeForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a plain text message through the real ChannelHandler and MessageGateway', async () => {
    const { mainAgent } = await start('Hi there!');

    await emitUpsert([waMessage({ message: { conversation: 'hello koris' } })]);

    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Message: hello koris'),
        channel: 'whatsapp',
        target: '5511999999999@s.whatsapp.net',
      }),
    );
    expect(fakeSock.sendMessage).toHaveBeenCalledWith('5511999999999@s.whatsapp.net', { text: 'Hi there!' });
  });

  it('splits a long agent reply into multiple WhatsApp-sized chunks', async () => {
    await start('c'.repeat(9_000));

    await emitUpsert([waMessage({ message: { conversation: 'give me the essay' } })]);

    expect(fakeSock.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it('forwards a downloaded image to the main agent as an attachment', async () => {
    const { mainAgent } = await start('nice photo');

    await emitUpsert([
      waMessage({ message: { imageMessage: { caption: 'look at this', mimetype: 'image/jpeg' } } }),
    ]);

    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ data: Buffer.from('img-bytes').toString('base64'), mimeType: 'image/jpeg' }],
      }),
    );
  });

  it('never reaches the main agent for a top-level sticker message', async () => {
    const { mainAgent } = await start('unused');

    await emitUpsert([waMessage({ message: { stickerMessage: { mimetype: 'image/webp' } } })]);

    expect(mainAgent.run).not.toHaveBeenCalled();
    expect(fakeSock.sendMessage).not.toHaveBeenCalled();
  });

  it('gates a group message on an explicit bot mention before reaching the main agent', async () => {
    const { mainAgent } = await start('unused');

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG2' },
        message: { conversation: 'no mention here' },
      }),
    ]);
    expect(mainAgent.run).not.toHaveBeenCalled();

    await emitUpsert([
      waMessage({
        key: { remoteJid: '1234-5678@g.us', fromMe: false, id: 'MSG3' },
        message: { conversation: 'hey @korisbot help' },
      }),
    ]);
    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: expect.stringContaining('Chat: "Family" (group)') }),
    );
  });

  it('replies with an error message when the main agent throws, without crashing the plugin', async () => {
    const { mainAgent } = await start('unused');
    mainAgent.run.mockRejectedValue(new Error('provider unavailable'));

    await emitUpsert([waMessage({ message: { conversation: 'hello' } })]);

    expect(fakeSock.sendMessage).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      { text: expect.stringContaining('provider unavailable') },
    );
  });

  it('does not re-run the main agent for a message.upsert replayed after a reconnect', async () => {
    const { mainAgent } = await start('pong');
    const replayed = waMessage({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'REPLAY-1' }, message: { conversation: 'hello' } });

    await emitUpsert([replayed]);
    await emitUpsert([replayed]); // simulates Baileys redelivering the same event after reconnect

    expect(mainAgent.run).toHaveBeenCalledTimes(1);
  });
});
