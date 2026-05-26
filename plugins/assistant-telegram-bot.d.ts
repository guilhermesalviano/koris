/**
 * Ambient type declaration for `assistant-telegram-bot`.
 * Replace this file with the real npm package once it is published.
 */
declare module 'assistant-telegram-bot' {
  export interface TelegramMessage {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    date: number;
  }

  export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
  }

  export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
  }

  export interface BotClient {
    sendMessage(chatId: number, text: string, options?: Record<string, unknown>): Promise<unknown>;
    sendChatAction(chatId: number, action: string): Promise<unknown>;
    stopPolling(): void;
  }

  export interface InitBotOptions {
    token: string;
    polling?: boolean;
    onMessage?: (msg: TelegramMessage) => void;
    onCallbackQuery?: (query: { id: string; data?: string; message?: TelegramMessage }) => void;
    onPollingError?: (error: Error) => void;
  }

  export function initBot(options: InitBotOptions): BotClient;
  export function getBot(): BotClient;
}
