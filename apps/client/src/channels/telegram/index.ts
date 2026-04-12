import { TelegramMessage, InlineKeyboardMarkup } from 'assistant-telegram-bot';
import { getBot } from 'assistant-telegram-bot';
import { handle } from '../../agents/handler';

const TYPING_INTERVAL_MS = 4_000;

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
}

function isEntityParseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /can't parse entities/i.test(error.message);
}

async function sendMessageWithMarkdownFallback(chatId: number, text: string): Promise<void> {
  const bot = getBot();
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    if (!isEntityParseError(error)) throw error;
    await bot.sendMessage(chatId, text);
  }
}

async function resolveResponse(response: unknown): Promise<string> {
  if (typeof response === 'string') return response;
  if (isAsyncIterable(response)) {
    let out = '';
    for await (const chunk of response) out += chunk;
    return out;
  }
  return String(response);
}

async function withTypingIndicator<T>(chatId: number, work: () => Promise<T>): Promise<T> {
  const bot = getBot();
  await bot.sendChatAction(chatId, 'typing');

  const timer = setInterval(() => {
    void bot.sendChatAction(chatId, 'typing').catch((error) => {
      console.error('Error refreshing typing action:', error);
    });
  }, TYPING_INTERVAL_MS);

  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function processAndReply(chatId: number, text: string): Promise<void> {
  const bot = getBot();
  try {
    await withTypingIndicator(chatId, async () => {
      const response = await handle(text, 'telegram');
      const resolved = await resolveResponse(response);
      await sendMessageWithMarkdownFallback(chatId, resolved);
    });
  } catch (error) {
    console.error('Error processing message:', error);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, I encountered an error processing your message. Please try again.'
    );
  }
}

export async function handleMessage(msg: TelegramMessage): Promise<void> {
  const { id: chatId } = msg.chat;
  const { text } = msg;

  if (text) {
    await processAndReply(chatId, text);
  }
}

export async function sendCode(
  chatId: number,
  code: string,
  language: string = ''
): Promise<void> {
  const bot = getBot();
  await bot.sendMessage(chatId, `\`\`\`${language}\n${code}\n\`\`\``, { parse_mode: 'Markdown' });
}

export async function sendWithApproval(
  chatId: number,
  message: string,
  callbackData: string
): Promise<void> {
  const bot = getBot();
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${callbackData}` },
        { text: '❌ Reject', callback_data: `reject:${callbackData}` },
      ],
    ],
  };

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
}