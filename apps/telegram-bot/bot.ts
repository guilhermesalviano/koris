import { TelegramBot } from './client';
import { config } from '../opencrawdio/src/config';
import { handleMessage } from '../opencrawdio/src/telegram/handlers';

let bot: TelegramBot;

export function initBot(): TelegramBot {
  // Always use polling mode
  bot = new TelegramBot(config.TELEGRAM.BOT_TOKEN, { polling: true });
  console.log('🤖 Telegram bot started in polling mode');

  // Register handlers
  bot.on('message', handleMessage);

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error);
  });

  return bot;
}

export function getBot(): TelegramBot {
  if (!bot) {
    throw new Error('Bot not initialized. Call initBot() first.');
  }
  return bot;
}
