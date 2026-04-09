import { TelegramBot, TelegramMessage } from './client';

export interface InitBotOptions {
  token: string;
  polling?: boolean;
  onMessage: (msg: TelegramMessage) => void | Promise<void>;
  onPollingError?: (error: Error) => void;
}

let bot: TelegramBot | undefined;

export function initBot(options: InitBotOptions): TelegramBot {
  const polling = options.polling ?? true;

  bot = new TelegramBot(options.token, { polling });

  bot.on('message', options.onMessage);

  bot.on('polling_error', (error) => {
    if (options.onPollingError) {
      options.onPollingError(error);
      return;
    }
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

export function resetBotForTests(): void {
  bot = undefined;
}
