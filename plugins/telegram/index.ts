import type { InlineKeyboardMarkup, TelegramBot, TelegramMessage } from '@guilhermesalviano/telegram-bot';
import { ADAPTERS, splitMessage } from '../contracts';
import type {
  ChannelDefinition,
  IChannelHandlerFactory,
  ILogger,
  IMessageGateway,
  ImageAttachment,
  Plugin,
  PluginContext,
} from '../contracts';
import type { PluginRegistry } from '../registry';
import { NOT_AUTHORIZED_MESSAGE } from '../../src/constants';

const TYPING_INTERVAL_MS = 5_000;
const TELEGRAM_MESSAGE_LIMIT = 4_000;

let botUsername: string | null = null;
let botToken = '';
let channelHandler: IChannelHandlerFactory;
let telegramWhitelist = new Set<number>();
let allowUntrusted = false;

interface ITelegramChannel {
  handleMessage(gateway: IMessageGateway, msg: TelegramMessage): Promise<void>;
  sendText(chatId: number, text: string): Promise<void>;
  sendCode(chatId: number, code: string, language?: string): Promise<void>;
  sendWithApproval(logger: ILogger, chatId: number, message: string, callbackData: string): Promise<void>;
}

interface TelegramChannelStartOptions {
  token: string;
  gateway: IMessageGateway;
  logger: ILogger;
}

interface TelegramPluginOptions {
  token: string;
  enabled: boolean;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

interface TelegramPhotoMessage extends TelegramMessage {
  photo?: TelegramPhotoSize[];
  caption?: string;
  reply_to_message?: TelegramPhotoMessage;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
};

function mimeFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_MIME_BY_EXT[ext];
}

function telegramFileBaseUrl(): string {
  return `https://api.telegram.org/bot${botToken}`;
}

function telegramFileDownloadUrl(): string {
  return `https://api.telegram.org/file/bot${botToken}`;
}

class TelegramChannel implements ITelegramChannel {
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
    const mentionsBot = isBotMentioned(text, telegramMsg.entities ?? [], botUsername);

    if (isGroup && !mentionsBot) {
      return;
    }

    const isWhitelisted = msg.from?.id != null && telegramWhitelist.has(msg.from.id);

    if (!allowUntrusted && !isWhitelisted) {
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
        const handler = channelHandler.create({
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

class TelegramChannelFactory {
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
        botUsername = me.username ?? null;
        options.logger.info(`Telegram is ready! Bot username: @${botUsername ?? '(unknown)'}`);
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

const telegramChannel = TelegramChannelFactory.create();

async function handleMessage(gateway: IMessageGateway, msg: TelegramMessage): Promise<void> {
  await telegramChannel.handleMessage(gateway, msg);
}

async function sendCode(chatId: number, code: string, language?: string): Promise<void> {
  await telegramChannel.sendCode(chatId, code, language);
}

async function sendText(chatId: number, text: string): Promise<void> {
  await telegramChannel.sendText(chatId, text);
}

async function sendWithApproval(
  logger: ILogger,
  chatId: number,
  message: string,
  callbackData: string,
): Promise<void> {
  await telegramChannel.sendWithApproval(logger, chatId, message, callbackData);
}

function isBotMentioned(
  text: string,
  entities: Array<{ type: string; offset: number; length: number }>,
  username: string | null,
): boolean {
  if (!username) return false;
  const target = `@${username.toLowerCase()}`;
  return entities.some(
    (e) => e.type === 'mention' && text.substring(e.offset, e.offset + e.length).toLowerCase() === target,
  );
}

function createTelegramAdapter(options: TelegramPluginOptions): ChannelDefinition {
  return {
    name: 'telegram',
    enabled: () => options.enabled && options.token.length > 0,
    start: (logger: ILogger, gateway: IMessageGateway) => {
      let stopFn: (() => void) | null = null;

      TelegramChannelFactory.start({ token: options.token, gateway, logger })
        .then(({ stop }) => { stopFn = stop; })
        .catch((err: Error) => logger.warn(`Failed to start Telegram bot: ${err.message}`));

      return () => { stopFn?.(); };
    },
    sendMessage: async (_logger: ILogger, target: string, message: string) => {
      const chatId = Number(target);

      if (!Number.isFinite(chatId)) {
        throw new Error(`Invalid Telegram chat ID: ${target}`);
      }

      await TelegramChannelFactory.sendText(chatId, message);
    },
  };
}

function createTelegramPlugin(options: TelegramPluginOptions): Plugin {
  return {
    name: 'telegram',
    setup(registry: PluginRegistry) {
      registry.extend(ADAPTERS, createTelegramAdapter(options));
    },
  };
}

/**
 * Primes the module-level runtime state (channel handler, whitelist, trust
 * policy) that `create()` normally sets once at boot — and skips entirely
 * when Telegram starts disabled — so a caller can (re)start Telegram live
 * (e.g. after the setup wizard enables it) without restarting the process.
 */
export function configureTelegramRuntime(cfg: {
  channelHandler: IChannelHandlerFactory;
  token: string;
  whitelist: string;
  allowUntrusted: boolean;
}): void {
  botToken = cfg.token;
  channelHandler = cfg.channelHandler;
  telegramWhitelist = new Set(
    cfg.whitelist.split(',').map((id) => id.trim()).filter(Boolean).map(Number),
  );
  allowUntrusted = cfg.allowUntrusted;
}

export {
  createTelegramPlugin,
  handleMessage,
  ITelegramChannel,
  sendText,
  sendCode,
  sendWithApproval,
  TelegramChannel,
  TelegramChannelFactory,
};

/** @internal — only for use in tests */
export function _setBotUsernameForTesting(username: string | null): void {
  botUsername = username;
}

/** @internal — only for use in tests */
export function _setTelegramWhitelistForTesting(ids: number[]): void {
  telegramWhitelist.clear();
  ids.forEach((id) => telegramWhitelist.add(id));
}

export function create(context: PluginContext): Plugin | null {
  const cfg = context.config.channels.TELEGRAM;
  if (!cfg.ENABLED) {
    return null;
  }

  botToken = cfg.BOT_TOKEN;
  channelHandler = context.channelHandler;
  allowUntrusted = context.config.channels.ALLOW_UNTRUSTED;
  telegramWhitelist = new Set(
    cfg.WHITELIST.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
  );

  return createTelegramPlugin({
    token: cfg.BOT_TOKEN,
    enabled: true,
  });
}