import { TelegramChannel } from './channel';
import { telegramState } from './state';
import type { ITelegramChannel, TelegramChannelStartOptions } from './types';

export class TelegramChannelFactory {
  static create(): ITelegramChannel {
    return new TelegramChannel();
  }

  static async start(options: TelegramChannelStartOptions): Promise<{ channel: ITelegramChannel; stop: () => void }> {
    const channel = new TelegramChannel();
    const { initBot } = await import('@guilhermesalviano/telegram-bot');

    const bot = initBot({
      token: options.token,
      polling: true,
      onMessage: (msg) => {
        options.logger.debug(`[telegram] raw message received: ${JSON.stringify(msg)}`);
        return channel.handleMessage(options.gateway, msg);
      },
      onPollingError: (error) => options.logger.warn(`Telegram polling error: ${error.message}`),
    });

    bot.getMe()
      .then((me) => {
        telegramState.botUsername = me.username ?? null;
        options.logger.info(`Telegram is ready! Bot username: @${telegramState.botUsername ?? '(unknown)'}`);
      })
      .catch((err: Error) => options.logger.warn(`Failed to fetch bot info: ${err.message}`));

    return {
      channel,
      stop: () => bot.stopPolling(),
    };
  }

  static async sendText(chatId: number, text: string): Promise<void> {
    const channel = new TelegramChannel();
    await channel.sendText(chatId, text);
  }
}
