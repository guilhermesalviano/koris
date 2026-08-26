import type { TelegramMessage } from '@guilhermesalviano/telegram-bot';
import type { ILogger, IMessageGateway } from '../contracts';

export interface ITelegramChannel {
  handleMessage(gateway: IMessageGateway, msg: TelegramMessage): Promise<void>;
  sendText(chatId: number, text: string): Promise<void>;
  sendCode(chatId: number, code: string, language?: string): Promise<void>;
  sendWithApproval(logger: ILogger, chatId: number, message: string, callbackData: string): Promise<void>;
}

export interface TelegramChannelStartOptions {
  token: string;
  gateway: IMessageGateway;
  logger: ILogger;
}

export interface TelegramPluginOptions {
  token: string;
  enabled: boolean;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

export interface TelegramPhotoMessage extends TelegramMessage {
  photo?: TelegramPhotoSize[];
  caption?: string;
  reply_to_message?: TelegramPhotoMessage;
}
