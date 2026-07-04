import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';
import { RESPONSE_ANCHOR, THINK_END, THINK_START } from '../../../../src/constants/thinking';
import { _setBotUsernameForTesting, handleMessage } from '../../../../plugins/telegram';

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

    expect(agent.handle).toHaveBeenCalledWith(text);
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
});
