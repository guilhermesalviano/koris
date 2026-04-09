import { TelegramMessage, InlineKeyboardMarkup } from 'assistant-telegram-bot';
import { getBot } from './bot';
import { processUserMessage } from '../agent/processor';

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
    // Send typing indicator
    await bot.sendChatAction(chatId, 'typing');

    // Process command through agent processor
    const response = await processUserMessage(text, 'telegram');
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
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
    // Send typing indicator
    await bot.sendChatAction(chatId, 'typing');

    // Process message through agent processor
    const response = await processUserMessage(text, 'telegram');
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
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
