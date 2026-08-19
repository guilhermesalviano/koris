import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import { ChannelHandlerFactory } from '../../../../src/channels';
import {
  _setBotUsernameForTesting,
  _setTelegramWhitelistForTesting,
  create,
  handleMessage,
  sendCode,
  sendText,
  sendWithApproval,
  TelegramChannelFactory,
} from '../../../../plugins/telegram';
import type { PluginContext } from '../../../../plugins/contracts';

const BOT_USERNAME = 'KorisBot';

const bot = vi.hoisted(() => ({
  sendChatAction: vi.fn(),
  sendMessage: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('@guilhermesalviano/telegram-bot', () => ({
  getBot: () => bot,
  initBot: vi.fn(),
}));

function makeContext(overrides: { enabled?: boolean; whitelist?: string; allowUntrusted?: boolean } = {}): PluginContext {
  return {
    config: {
      channels: {
        ALLOW_UNTRUSTED: overrides.allowUntrusted ?? false,
        TELEGRAM: {
          ENABLED: overrides.enabled ?? true,
          BOT_TOKEN: 'test-token',
          WHITELIST: overrides.whitelist ?? '123',
        },
        WHATSAPP: { ENABLED: false, AUTH_FOLDER: '', WHITELIST: '', MENTION_ID: '' },
      },
    },
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    gateway: { handle: vi.fn() },
    channelHandler: ChannelHandlerFactory,
  };
}

function createMessage(
  text: string,
  chatType: string = 'private',
  entities: TelegramMessage['entities'] = [],
  fromId: number = 123,
): TelegramMessage {
  return {
    chat: { id: 123, type: chatType },
    from: { id: fromId, is_bot: false, first_name: 'Test' },
    text,
    entities,
  } as TelegramMessage;
}

function mentionEntity(text: string, username: string): TelegramMessage['entities'] {
  const mention = `@${username}`;
  const offset = text.indexOf(mention);
  if (offset === -1) throw new Error(`"${mention}" not found in text`);
  return [{ type: 'mention', offset, length: mention.length }];
}

async function* createResponseStream(): AsyncGenerator<string> {
  yield THINK_START;
  yield 'internal reasoning';
  yield THINK_END;
  yield RESPONSE_ANCHOR;
  yield 'Visible reply';
}

describe('channels/telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bot.sendChatAction.mockResolvedValue(undefined);
    bot.sendMessage.mockResolvedValue(undefined);
    create(makeContext());
    _setBotUsernameForTesting(null);
    _setTelegramWhitelistForTesting([123]);
  });

  it('removes think output before sending the Telegram reply', async () => {
    const agent: Parameters<typeof handleMessage>[0] = {
      handle: vi.fn().mockResolvedValue(createResponseStream()),
    };

    await handleMessage(agent, createMessage('hello'));

    expect(bot.sendChatAction).toHaveBeenCalledWith(123, 'typing');
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage).toHaveBeenCalledWith(123, 'Visible reply', {
      parse_mode: 'MarkdownV2',
    });
  });

  it('responds to group message when bot is mentioned via entity', async () => {
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = {
      handle: vi.fn().mockResolvedValue('pong'),
    };
    const text = `hey @${BOT_USERNAME} what time is it?`;

    await handleMessage(agent, createMessage(text, 'group', mentionEntity(text, BOT_USERNAME)));

    expect(agent.handle).toHaveBeenCalledWith({ text, images: [] }, '123', { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true });
    expect(bot.sendMessage).toHaveBeenCalled();
  });

  it('ignores group message with no mention entities', async () => {
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, createMessage('anyone know the weather today?', 'group', []));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores group message mentioning a different bot', async () => {
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };
    const text = 'hey @OtherBot help me';

    await handleMessage(agent, createMessage(text, 'group', mentionEntity(text, 'OtherBot')));

    expect(agent.handle).not.toHaveBeenCalled();
  });

  it('ignores group message when botUsername is not yet initialized', async () => {
    _setBotUsernameForTesting(null);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };
    const text = `hey @${BOT_USERNAME} hello`;

    await handleMessage(agent, createMessage(text, 'group', mentionEntity(text, BOT_USERNAME)));

    expect(agent.handle).not.toHaveBeenCalled();
  });

  it('ignores supergroup message with no mention entities', async () => {
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, createMessage('random chat message', 'supergroup', []));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores messages without text', async () => {
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, { chat: { id: 123, type: 'private' }, text: undefined } as never);

    expect(agent.handle).not.toHaveBeenCalled();
  });

  it('ignores private messages from a non-whitelisted sender', async () => {
    _setTelegramWhitelistForTesting([123]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, createMessage('hello', 'private', [], 999));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('processes private messages from a whitelisted sender', async () => {
    _setTelegramWhitelistForTesting([123]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createMessage('hello', 'private', [], 123));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'hello', images: [] }, '123', { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true });
    expect(bot.sendMessage).toHaveBeenCalled();
  });

  it('denies everyone when the whitelist is empty and replies with the default message', async () => {
    _setTelegramWhitelistForTesting([]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, createMessage('hello', 'private', [], 999));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledWith(
      123,
      'You need to allow this number to send messages on the server.',
    );
  });

  it('processes private messages from a non-whitelisted sender when allow_untrusted is on', async () => {
    create(makeContext({ allowUntrusted: true }));
    _setTelegramWhitelistForTesting([123]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createMessage('hello', 'private', [], 999));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'hello', images: [] }, '123', { channel: 'telegram', toolsEnabled: false, learnedSkillsEnabled: false });
    expect(bot.sendMessage).toHaveBeenCalled();
  });

  it('treats whitelisted senders as trusted when allow_untrusted is on', async () => {
    create(makeContext({ allowUntrusted: true }));
    _setTelegramWhitelistForTesting([123]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createMessage('hello', 'private', [], 123));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'hello', images: [] }, '123', { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true });
  });

  it('allows everyone without a deny message when allow_untrusted is on and whitelist is empty', async () => {
    create(makeContext({ allowUntrusted: true }));
    _setTelegramWhitelistForTesting([]);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createMessage('hello', 'private', [], 999));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'hello', images: [] }, '123', { channel: 'telegram', toolsEnabled: false, learnedSkillsEnabled: false });
    expect(bot.sendMessage).not.toHaveBeenCalledWith(
      123,
      'You need to allow this number to send messages on the server.',
    );
  });

  it('ignores group messages from a non-whitelisted sender even when mentioned', async () => {
    _setTelegramWhitelistForTesting([123]);
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };
    const text = `hey @${BOT_USERNAME} help me`;

    await handleMessage(agent, createMessage(text, 'group', mentionEntity(text, BOT_USERNAME), 999));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send the deny message for unmentioned group messages when the whitelist is empty', async () => {
    _setTelegramWhitelistForTesting([]);
    _setBotUsernameForTesting(BOT_USERNAME);
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn() };

    await handleMessage(agent, createMessage('random chat', 'group', [], 999));

    expect(agent.handle).not.toHaveBeenCalled();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('coerces non-string non-stream responses with String()', async () => {
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue(42) };

    await handleMessage(agent, createMessage('hello'));

    expect(bot.sendMessage).toHaveBeenCalledWith(123, '42', { parse_mode: 'MarkdownV2' });
  });

  it('sends an error message when the agent throws', async () => {
    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockRejectedValue(new Error('boom')) };

    await handleMessage(agent, createMessage('hello'));

    expect(bot.sendMessage).toHaveBeenCalledWith(123, expect.stringContaining('❌'));
  });
});

describe('channels/telegram photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create(makeContext());
    _setTelegramWhitelistForTesting([123]);
    _setBotUsernameForTesting(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createPhotoMessage(photo: Array<{ file_id: string }>, caption?: string): TelegramMessage {
    return {
      chat: { id: 123, type: 'private' },
      from: { id: 123, is_bot: false, first_name: 'Test' },
      photo,
      caption,
    } as TelegramMessage;
  }

  it('downloads a telegram photo and forwards it as an image attachment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'photos/file.jpg' } }),
      })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from('fake-image-bytes') });
    vi.stubGlobal('fetch', fetchMock);

    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createPhotoMessage([{ file_id: 'file-1' }], 'what is this?'));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.telegram.org/bottest-token/getFile',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ file_id: 'file-1' }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/file/bottest-token/photos/file.jpg');
    expect(agent.handle).toHaveBeenCalledWith(
      {
        text: 'what is this?',
        images: [{ data: Buffer.from('fake-image-bytes').toString('base64'), mimeType: 'image/jpeg' }],
      },
      '123',
      { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true },
    );
    expect(bot.sendMessage).toHaveBeenCalled();
  });

  it('forwards an image-only photo message without a caption', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'photos/img.png' } }),
      })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from('png-bytes') });
    vi.stubGlobal('fetch', fetchMock);

    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createPhotoMessage([{ file_id: 'file-2' }]));

    expect(agent.handle).toHaveBeenCalledWith(
      {
        text: '',
        images: [{ data: Buffer.from('png-bytes').toString('base64'), mimeType: 'image/png' }],
      },
      '123',
      { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true },
    );
  });

  it('forwards no images when getFile fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error_code: 400, description: 'Bad file' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createPhotoMessage([{ file_id: 'file-3' }], 'analyze'));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'analyze', images: [] }, '123', { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true });
  });

  it('forwards no images when the media download is not ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'photos/file.jpg' } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    const agent: Parameters<typeof handleMessage>[0] = { handle: vi.fn().mockResolvedValue('pong') };

    await handleMessage(agent, createPhotoMessage([{ file_id: 'file-4' }], 'analyze'));

    expect(agent.handle).toHaveBeenCalledWith({ text: 'analyze', images: [] }, '123', { channel: 'telegram', toolsEnabled: true, learnedSkillsEnabled: true });
  });
});

describe('channels/telegram send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bot.sendMessage.mockResolvedValue(undefined);
  });

  it('sendText sends short messages as a single chunk', async () => {
    await sendText(123, 'hi');

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage).toHaveBeenCalledWith(123, 'hi', { parse_mode: 'MarkdownV2' });
  });

  it('sendText splits long messages into multiple chunks', async () => {
    await sendText(123, 'a'.repeat(10_000));

    expect(bot.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it('sendText falls back to plain text when MarkdownV2 parse fails', async () => {
    bot.sendMessage
      .mockRejectedValueOnce(new Error("can't parse entities in text"))
      .mockResolvedValueOnce(undefined);

    await sendText(123, 'hello');

    expect(bot.sendMessage).toHaveBeenNthCalledWith(1, 123, 'hello', { parse_mode: 'MarkdownV2' });
    expect(bot.sendMessage).toHaveBeenNthCalledWith(2, 123, 'hello');
  });

  it('sendText rethrows non-parse errors', async () => {
    bot.sendMessage.mockRejectedValueOnce(new Error('network error'));

    await expect(sendText(123, 'hello')).rejects.toThrow('network error');
  });

  it('sendCode wraps the content in a code block', async () => {
    await sendCode(123, 'const x = 1;', 'ts');

    expect(bot.sendMessage).toHaveBeenCalledWith(123, '```ts\nconst x = 1;\n```', {
      parse_mode: 'Markdown',
    });
  });

  it('sendWithApproval sends an inline approve/reject keyboard', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

    await sendWithApproval(logger as never, 123, 'confirm?', 'task-1');

    expect(bot.sendMessage).toHaveBeenCalledWith(123, 'confirm?', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: 'approve:task-1' },
            { text: '❌ Reject', callback_data: 'reject:task-1' },
          ],
        ],
      },
    });
  });

  it('TelegramChannelFactory.sendText sends a message', async () => {
    await TelegramChannelFactory.sendText(456, 'factory');

    expect(bot.sendMessage).toHaveBeenCalledWith(456, 'factory', { parse_mode: 'MarkdownV2' });
  });
});

describe('create()', () => {
  it('returns null when telegram is disabled', () => {
    expect(create(makeContext({ enabled: false }))).toBeNull();
  });

  it('returns a plugin when telegram is enabled', () => {
    const plugin = create(makeContext({ enabled: true }));

    expect(plugin).not.toBeNull();
    expect(plugin?.name).toBe('telegram');
  });
});
