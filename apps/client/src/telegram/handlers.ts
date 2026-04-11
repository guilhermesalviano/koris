import { TelegramMessage, InlineKeyboardMarkup } from 'assistant-telegram-bot';
import { getBot } from './bot';
import { processUserMessage } from '../agent/processor';

const TYPING_INTERVAL_MS = 30_000;

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
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

// todo: unify Telegram handle messages and TUI handle messages.
export async function handleMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`📨 Message from ${msg.from?.username || msg.from?.id}: ${text}`);

  // Set to process in bg with queue
  if (text?.startsWith('/')) {
    await handleCommand(msg);
    return;
  }

  // Handle regular messages
  if (text) {
    await handleUserMessage(chatId, text);
  }
}

async function handleCommand(msg: TelegramMessage): Promise<void> {
  const bot = getBot();
  const chatId = msg.chat.id;
  const text = msg.text || '';

  try {
    await withTypingIndicator(chatId, async () => {
      // Process command through agent processor
      const response = await processUserMessage(text, 'telegram');
      if (typeof response === 'string') {
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }
      if (isAsyncIterable(response)) {
        let out = '';
        for await (const chunk of response) out += chunk;
        await bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
        return;
      }
      await bot.sendMessage(chatId, String(response), { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error('Error handling command:', error);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, I encountered an error processing your command. Please try again.'
    );
  }
}

async function handleUserMessage(chatId: number, text: string): Promise<void> {
  const bot = getBot();

  try {
    await withTypingIndicator(chatId, async () => {
      // Process message through agent processor
      const response = await processUserMessage(text, 'telegram');
      if (typeof response === 'string') {
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }
      if (isAsyncIterable(response)) {
        let out = '';
        for await (const chunk of response) out += chunk;
        await bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
        return;
      }
      await bot.sendMessage(chatId, String(response), { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error('Error handling message:', error);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, I encountered an error processing your message. Please try again.'
    );
  }
}

// Helper function to send a message with code formatting
export async function sendCode(
  chatId: number,
  code: string,
  language: string = ''
): Promise<void> {
  const bot = getBot();
  const formatted = `\`\`\`${language}\n${code}\n\`\`\``;
  await bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
}

// Helper function to send a message with approval buttons
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

  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
