import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';

// Pushes realistic Telegram Bot API update shapes through the REAL seam:
// plugin (vendor SDK mocked) -> core ChannelHandler -> core MessageGateway
// (with a fake MainAgent, like unit/services/agents/message-gateway.test.ts)
// -> back out through the plugin's real send path. Only the vendor SDK and
// the agent/DB layers are faked; everything in `core/src/channels/**` and
// the plugin's own extraction/gating logic run for real.

const fakeBot = {
  sendMessage: vi.fn().mockResolvedValue({}),
  sendChatAction: vi.fn().mockResolvedValue(true),
  getMe: vi.fn().mockResolvedValue({ username: 'korisbot' }),
  stopPolling: vi.fn(),
  answerCallbackQuery: vi.fn().mockResolvedValue(true),
  editMessageText: vi.fn().mockResolvedValue({}),
};

vi.mock('@guilhermesalviano/telegram-bot', () => ({
  initBot: vi.fn(() => fakeBot),
  getBot: vi.fn(() => fakeBot),
}));

import { ChannelHandlerFactory } from '../../src/channels/handler';
import { MessageGateway } from '../../src/services/agents/message-gateway';
import type { ILogger } from '../../src/infrastructure/logger';
import {
  handleMessage,
  configureTelegramRuntime,
  _setBotUsernameForTesting,
  _setTelegramWhitelistForTesting,
} from '../../../plugins/channels/telegram/index';

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
    'telegram',
    { resolve: vi.fn().mockReturnValue({ sessionService, messageService, memoryService }) } as never,
    { persistConversation: vi.fn(), summarizeConversation: vi.fn() } as never,
    mainAgent as never,
    { record: vi.fn() } as never,
  );

  return { gateway, mainAgent };
}

function baseMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    from: { id: 111, is_bot: false, first_name: 'Guilherme' },
    chat: { id: 555, type: 'private' },
    date: 1_700_000_000,
    ...overrides,
  };
}

function setupRuntime() {
  configureTelegramRuntime({
    channelHandler: ChannelHandlerFactory,
    allowUntrusted: true,
    config: { enabled: true, token: 'TEST_TOKEN', whitelist: '' },
  });
  _setTelegramWhitelistForTesting([]);
}

describe('telegram end-to-end pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setBotUsernameForTesting(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a plain text message through the real ChannelHandler and MessageGateway', async () => {
    setupRuntime();
    const { gateway, mainAgent } = makeGatewayWithFakeAgent('Hi there!');

    await handleMessage(gateway, baseMessage({ text: 'hello koris' }));

    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Message: hello koris'),
        channel: 'telegram',
        target: '555',
      }),
    );
    expect(fakeBot.sendMessage).toHaveBeenCalledWith(555, 'Hi there!', { parse_mode: 'MarkdownV2' });
  });

  it('splits a long agent reply into multiple Telegram-sized chunks', async () => {
    setupRuntime();
    const longReply = 'b'.repeat(9_000);
    const { gateway } = makeGatewayWithFakeAgent(longReply);

    await handleMessage(gateway, baseMessage({ text: 'give me the essay' }));

    expect(fakeBot.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it('forwards a downloaded photo to the main agent as an image attachment', async () => {
    setupRuntime();
    const { gateway, mainAgent } = makeGatewayWithFakeAgent('nice photo');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/getFile')) {
        return { json: async () => ({ ok: true, result: { file_path: 'photos/file_1.png' } }) } as Response;
      }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('img-bytes').buffer } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await handleMessage(
      gateway,
      baseMessage({
        ...({ caption: 'look at this', photo: [{ file_id: 'f1', file_unique_id: 'u1' }] } as Partial<TelegramMessage>),
      }),
    );

    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ data: Buffer.from('img-bytes').toString('base64'), mimeType: 'image/png' }],
      }),
    );

    vi.unstubAllGlobals();
  });

  it('never reaches the main agent for a message with neither text nor a photo', async () => {
    setupRuntime();
    const { gateway, mainAgent } = makeGatewayWithFakeAgent('unused');

    await handleMessage(gateway, baseMessage({ text: undefined }));

    expect(mainAgent.run).not.toHaveBeenCalled();
    expect(fakeBot.sendMessage).not.toHaveBeenCalled();
  });

  it('gates a group message on an explicit bot mention before reaching the main agent', async () => {
    _setBotUsernameForTesting('korisbot');
    setupRuntime();
    const { gateway, mainAgent } = makeGatewayWithFakeAgent('unused');

    await handleMessage(
      gateway,
      baseMessage({ chat: { id: 999, type: 'group', title: 'Family' }, text: 'no mention here' }),
    );
    expect(mainAgent.run).not.toHaveBeenCalled();

    await handleMessage(
      gateway,
      baseMessage({
        chat: { id: 999, type: 'group', title: 'Family' },
        text: 'hey @korisbot help',
        entities: [{ type: 'mention', offset: 4, length: 9 }],
      }),
    );
    expect(mainAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: expect.stringContaining('Chat: "Family" (group)') }),
    );
  });

  it('replies with an error message when the main agent throws, without crashing the plugin', async () => {
    setupRuntime();
    const { gateway, mainAgent } = makeGatewayWithFakeAgent('unused');
    mainAgent.run.mockRejectedValue(new Error('provider unavailable'));

    await handleMessage(gateway, baseMessage({ text: 'hello' }));

    expect(fakeBot.sendMessage).toHaveBeenCalledWith(555, expect.stringContaining('provider unavailable'));
  });
});
