import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import {
  _setBotUsernameForTesting,
  create,
  handleMessage,
  sendCode,
  sendText,
  sendWithApproval,
  TelegramChannelFactory,
} from '../../../../plugins/telegram';

const BOT_USERNAME = 'KorisBot';

const bot = vi.hoisted(() => ({
  sendChatAction: vi.fn(),
  sendMessage: vi.fn(),
  getMe: vi.fn(),
}));

const configMock = vi.hoisted(() => ({
  config: {
    CHANNELS: {
      TELEGRAM: {
        ENABLED: false,
        BOT_TOKEN: 'test-token',
      },
    },
  },
}));

vi.mock('@guilhermesalviano/telegram-bot', () => ({
  getBot: () => bot,
  initBot: vi.fn(),
}));

vi.mock('../../../../src/config', () => configMock);

function createMessage(
  text: string,
  chatType: string = 'private',
  entities: TelegramMessage['entities'] = [],
): TelegramMessage {
  return { chat: { id: 123, type: chatType }, text, entities } as TelegramMessage;
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
    _setBotUsernameForTesting(null);
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

    expect(agent.handle).toHaveBeenCalledWith(text, '123');
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
    configMock.config.CHANNELS.TELEGRAM.ENABLED = false;

    expect(create()).toBeNull();
  });

  it('returns a plugin when telegram is enabled', () => {
    configMock.config.CHANNELS.TELEGRAM.ENABLED = true;

    const plugin = create();

    expect(plugin).not.toBeNull();
    expect(plugin?.name).toBe('telegram');
  });
});
