import type { InlineKeyboardMarkup, TelegramBot, TelegramMessage } from '@guilhermesalviano/telegram-bot';
import { splitMessage } from '../contracts';
import type { ILogger, IMessageGateway, ImageAttachment } from '../contracts';
import { NOT_AUTHORIZED_MESSAGE, TELEGRAM_MESSAGE_LIMIT, TYPING_INTERVAL_MS } from './constants';
import { isBotMentioned } from './mention';
import { mimeFromPath, telegramFileBaseUrl, telegramFileDownloadUrl } from './media';
import { telegramState } from './state';
import type { ITelegramChannel, TelegramPhotoMessage } from './types';

export class TelegramChannel implements ITelegramChannel {
  constructor(private readonly bot?: TelegramBot) {}

  async handleMessage(gateway: IMessageGateway, msg: TelegramMessage): Promise<void> {
    const { id: chatId, type: chatType } = msg.chat;
    const telegramMsg = msg as TelegramPhotoMessage;
    const text = telegramMsg.caption ?? telegramMsg.text ?? '';
    const photo = telegramMsg.photo?.[telegramMsg.photo.length - 1];

    const repliedMsg = telegramMsg.reply_to_message;
    const quotedText = repliedMsg?.caption ?? repliedMsg?.text;
    const quotedPhoto = repliedMsg?.photo?.[repliedMsg.photo.length - 1];

    if (!text && !photo) {
      return;
    }

    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const mentionsBot = isBotMentioned(text, telegramMsg.entities ?? [], telegramState.botUsername);

    if (isGroup && !mentionsBot) {
      return;
    }

    const isWhitelisted = msg.from?.id != null && telegramState.telegramWhitelist.has(msg.from.id);

    if (!telegramState.allowUntrusted && !isWhitelisted) {
      await this.sendDenyMessage(chatId);
      return;
    }

    const images = photo ? await this.downloadPhoto(photo.file_id) : [];
    if (quotedPhoto) {
      const quotedImages = await this.downloadPhoto(quotedPhoto.file_id);
      images.push(...quotedImages.map((img) => ({ ...img, source: 'quoted' as const })));
    }
    await this.processAndReply(gateway, chatId, text, images, isGroup, mentionsBot, isWhitelisted, msg.chat.title, quotedText);
  }

  async sendText(chatId: number, text: string): Promise<void> {
    for (const chunk of splitMessage(text, TELEGRAM_MESSAGE_LIMIT)) {
      await this.sendMessageWithMarkdownFallback(chatId, chunk);
    }
  }

  async sendCode(chatId: number, code: string, language: string = ''): Promise<void> {
    await (await this.getBotClient()).sendMessage(chatId, `\`\`\`${language}\n${code}\n\`\`\``, { parse_mode: 'Markdown' });
  }

  async sendWithApproval(
    logger: ILogger,
    chatId: number,
    message: string,
    callbackData: string,
  ): Promise<void> {
    logger.info(`Sending message with approval to chat ${chatId}: ${message}`);

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${callbackData}` },
          { text: '❌ Reject', callback_data: `reject:${callbackData}` },
        ],
      ],
    };

    await (await this.getBotClient()).sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  private async sendDenyMessage(chatId: number): Promise<void> {
    try {
      await (await this.getBotClient()).sendMessage(chatId, NOT_AUTHORIZED_MESSAGE);
    } catch (err) {
      console.error('Error sending deny message:', err);
    }
  }

  private async processAndReply(
    gateway: IMessageGateway,
    chatId: number,
    text: string,
    images: ImageAttachment[],
    isGroup: boolean,
    mentionsBot: boolean,
    isTrustedSender: boolean,
    groupName?: string,
    quotedText?: string,
  ): Promise<void> {
    try {
      await this.withTypingIndicator(chatId, async () => {
        const handler = telegramState.channelHandler.create({
          channel: 'telegram',
          gateway,
          prefixSenderName: false,
          reply: {
            sendText: (target: string, reply: string) => this.sendText(Number(target), reply),
            sendError: async (target: string, message: string) => {
              await (await this.getBotClient()).sendMessage(Number(target), message);
            },
          },
        });

        await handler.handle(String(chatId), {
          text,
          images,
          quotedText,
          isGroup,
          mentionsBot,
          isTrustedSender,
          groupName,
        });
      });
    } catch (err) {
      console.error('Error processing message:', err);
      const error = err instanceof Error ? err.message : 'Sorry, I ran into an unexpected problem. Could you try again?';
      await (await this.getBotClient()).sendMessage(chatId, `❌ ${error}`);
    }
  }

  private async downloadPhoto(fileId: string): Promise<ImageAttachment[]> {
    try {
      const baseUrl = telegramFileBaseUrl();
      const fileRes = await fetch(`${baseUrl}/getFile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
      });
      const fileData = await fileRes.json() as { ok?: boolean; result?: { file_path?: string } };
      const filePath = fileData.ok ? fileData.result?.file_path : undefined;
      if (!filePath) {
        return [];
      }

      const mediaRes = await fetch(`${telegramFileDownloadUrl()}/${filePath}`);
      if (!mediaRes.ok) {
        return [];
      }

      const base64 = Buffer.from(await mediaRes.arrayBuffer()).toString('base64');
      const mimeType = mimeFromPath(filePath);
      return [{ data: base64, ...(mimeType ? { mimeType } : {}) }];
    } catch (err) {
      console.error('Error downloading Telegram photo:', err);
      return [];
    }
  }

  private async sendMessageWithMarkdownFallback(chatId: number, text: string): Promise<void> {
    const bot = await this.getBotClient();
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      if (!this.isEntityParseError(error)) {
        throw error;
      }

      await bot.sendMessage(chatId, text);
    }
  }

  private async withTypingIndicator<T>(chatId: number, work: () => Promise<T>): Promise<T> {
    try {
      await (await this.getBotClient()).sendChatAction(chatId, 'typing');
    } catch {}

    const timer = setInterval(() => {
      void this.getBotClient().then((bot) => bot.sendChatAction(chatId, 'typing')).catch(() => {});
    }, TYPING_INTERVAL_MS);

    try {
      return await work();
    } finally {
      clearInterval(timer);
    }
  }

  private isEntityParseError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /can't parse entities/i.test(error.message);
  }

  private async getBotClient(): Promise<TelegramBot> {
    if (this.bot) {
      return this.bot;
    }

    const { getBot } = await import('@guilhermesalviano/telegram-bot');
    return getBot();
  }
}
