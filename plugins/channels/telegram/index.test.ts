import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelHandlerFactory, IMessageGateway, ILogger } from '../contracts';
import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';

// This suite proves the telegram plugin is testable with zero core imports:
// the only non-relative imports below are the vendor SDK (mocked) and the
// plugin's own `../contracts` types.

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

import {
  TelegramChannel,
  handleMessage,
  configureTelegramRuntime,
  _setBotUsernameForTesting,
  _setTelegramWhitelistForTesting,
  create,
} from './index';
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

function baseMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    from: { id: 111, is_bot: false, first_name: 'Guilherme' },
    chat: { id: 555, type: 'private' },
    date: 1_700_000_000,
    ...overrides,
  };
}

function setupRuntime(replyText = 'Assistant reply', opts: { allowUntrusted?: boolean; whitelist?: number[] } = {}) {
  const { factory, calls } = makeChannelHandlerFactory(replyText);
  configureTelegramRuntime({
    channelHandler: factory,
    allowUntrusted: opts.allowUntrusted ?? true,
    config: { enabled: true, token: 'TEST_TOKEN', whitelist: '' },
  });
  if (opts.whitelist) {
    _setTelegramWhitelistForTesting(opts.whitelist);
  } else {
    _setTelegramWhitelistForTesting([]);
  }
  return calls;
}

describe('telegram plugin', () => {
  const gateway: IMessageGateway = { handle: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    _setBotUsernameForTesting(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles a plain text DM and replies through the bot client', async () => {
    const calls = setupRuntime('pong');

    await handleMessage(gateway, baseMessage({ text: 'hello there' }));

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe('555');
    expect(calls[0].message).toMatchObject({ text: 'hello there', isGroup: false, mentionsBot: false });
    expect(fakeBot.sendMessage).toHaveBeenCalledWith(555, 'pong', { parse_mode: 'MarkdownV2' });
  });

  it('splits a reply longer than the Telegram chunk limit into multiple sends', async () => {
    const longReply = 'a'.repeat(9_000);
    setupRuntime(longReply);

    await handleMessage(gateway, baseMessage({ text: 'give me a long answer' }));

    expect(fakeBot.sendMessage.mock.calls.length).toBeGreaterThan(1);
    for (const call of fakeBot.sendMessage.mock.calls) {
      const [, chunk] = call as [number, string, unknown];
      expect(chunk.length).toBeLessThanOrEqual(4_000);
    }
  });

  it('downloads a photo and forwards it as an image attachment', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/getFile')) {
        return { json: async () => ({ ok: true, result: { file_path: 'photos/file_1.jpg' } }) } as Response;
      }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('fake-bytes').buffer } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const calls = setupRuntime('got the image');
    await handleMessage(
      gateway,
      baseMessage({
        // Real Telegram Bot API photo payload: caption + an array of sizes,
        // smallest first. Not part of the vendor package's own `TelegramMessage`
        // type (see FINDINGS.md §5) but present on the raw JSON it forwards.
        ...( { caption: 'check this out', photo: [
          { file_id: 'small', file_unique_id: 'u1', width: 90, height: 90 },
          { file_id: 'large', file_unique_id: 'u2', width: 800, height: 800 },
        ] } as Partial<TelegramMessage>),
      }),
    );

    expect(calls).toHaveLength(1);
    const images = calls[0].message.images as Array<{ data: string; mimeType?: string }>;
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe('image/jpeg');
    expect(images[0].data).toBe(Buffer.from('fake-bytes').toString('base64'));
    expect(calls[0].message.text).toBe('check this out');

    vi.unstubAllGlobals();
  });

  it('drops a message with neither text nor a photo', async () => {
    const calls = setupRuntime('should not be sent');

    // Realistic "unsupported" case: e.g. a voice message. The plugin only
    // ever reads `text`/`caption`/`photo`, so this update carries none of them.
    await handleMessage(gateway, baseMessage({ text: undefined }));

    expect(calls).toHaveLength(0);
    expect(fakeBot.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a group message that does not mention the bot', async () => {
    _setBotUsernameForTesting('korisbot');
    const calls = setupRuntime('should not be sent');

    await handleMessage(
      gateway,
      baseMessage({ chat: { id: 999, type: 'group', title: 'Family' }, text: 'hello everyone' }),
    );

    expect(calls).toHaveLength(0);
    expect(fakeBot.sendMessage).not.toHaveBeenCalled();
  });

  it('processes a group message that mentions the bot', async () => {
    _setBotUsernameForTesting('korisbot');
    const calls = setupRuntime('pong');

    await handleMessage(
      gateway,
      baseMessage({
        chat: { id: 999, type: 'group', title: 'Family' },
        text: 'hey @korisbot help me',
        entities: [{ type: 'mention', offset: 4, length: 9 }],
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toMatchObject({ isGroup: true, mentionsBot: true, groupName: 'Family' });
  });

  it('denies an untrusted sender instead of reaching the channel handler', async () => {
    const calls = setupRuntime('pong', { allowUntrusted: false, whitelist: [] });

    await handleMessage(gateway, baseMessage({ text: 'hello', from: { id: 42, is_bot: false, first_name: 'Stranger' } }));

    expect(calls).toHaveLength(0);
    expect(fakeBot.sendMessage).toHaveBeenCalledWith(
      555,
      expect.stringContaining("You're not authorized"),
    );
  });

  it('declares capabilities matching what the installed vendor package actually supports', () => {
    let registered: ChannelDefinition | undefined;
    const fakeRegistry = { extend: vi.fn((_point, value: ChannelDefinition) => { registered = value; }) } as unknown as PluginRegistry;

    const plugin = create(
      { allowUntrusted: true, logger: makeLogger(), gateway, channelHandler: makeChannelHandlerFactory('n/a').factory },
      { enabled: true, token: 'TEST_TOKEN', whitelist: '' },
    );
    plugin?.setup(fakeRegistry);

    expect(registered?.capabilities).toEqual({
      streaming: true,
      markdown: true,
      interactive: false,
      maxMessageChars: 4_000,
    });
  });

  it('warns loudly, by plugin name, when enabled but bot_token is empty', () => {
    const logger = makeLogger();
    const factory = makeChannelHandlerFactory('n/a').factory;

    const plugin = create(
      { allowUntrusted: true, logger, gateway, channelHandler: factory },
      { enabled: true, token: '', whitelist: '' },
    );

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[telegram]'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bot_token is empty'));
    // The channel still registers, but `enabled()` reflects reality (no token, no start):
    let registered: ChannelDefinition | undefined;
    plugin?.setup({ extend: vi.fn((_point, value: ChannelDefinition) => { registered = value; }) } as unknown as PluginRegistry);
    expect(registered?.enabled()).toBe(false);
  });

  describe('approval flow (dead code today — see FINDINGS.md §3.5)', () => {
    it('sends an inline approve/reject keyboard with the current callback_data shape', async () => {
      setupRuntime('n/a');
      const channel = new TelegramChannel();

      await channel.sendWithApproval(makeLogger(), 555, 'Run this command?', 'run-42');

      expect(fakeBot.sendMessage).toHaveBeenCalledWith(555, 'Run this command?', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: 'approve:run-42' },
              { text: '❌ Reject', callback_data: 'reject:run-42' },
            ],
          ],
        },
      });
      // Nothing in the plugin or `TelegramChannelFactory.start` ever calls
      // `sendWithApproval`, and the vendor client drops `callback_query`
      // updates internally (no way to register a handler for them) — so this
      // keyboard, if ever sent, cannot currently be acted on by a user.
      // Locking in its shape here so Phase 3 can't silently change it.
    });
  });
});
