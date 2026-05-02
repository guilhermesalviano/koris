import { getBot, InlineKeyboardMarkup, TelegramMessage } from 'assistant-telegram-bot';
import { ILogger } from '../../infrastructure/logger';
import { IAgent } from '../../services/agents/main-agent/agent';
import { stripInternalStreamMarkers } from '../../utils/stream-markers';

const TYPING_INTERVAL_MS = 5_000;

interface TelegramBotClient {
  sendChatAction(chatId: number, action: 'typing'): Promise<unknown>;
  sendMessage(chatId: number, text: string, options?: Record<string, unknown>): Promise<unknown>;
}

interface ITelegramChannel {
  handleMessage(agent: IAgent, msg: TelegramMessage): Promise<void>;
  sendCode(chatId: number, code: string, language?: string): Promise<void>;
  sendWithApproval(logger: ILogger, chatId: number, message: string, callbackData: string): Promise<void>;
}

class TelegramChannel implements ITelegramChannel {
  constructor(private readonly bot?: TelegramBotClient) {}

  async handleMessage(agent: IAgent, msg: TelegramMessage): Promise<void> {
    const { id: chatId } = msg.chat;
    const { text } = msg;

    if (!text) {
      return;
    }

    await this.processAndReply(agent, chatId, text);
  }

  async sendCode(chatId: number, code: string, language: string = ''): Promise<void> {
    await this.getBotClient().sendMessage(chatId, `\`\`\`${language}\n${code}\n\`\`\``, { parse_mode: 'Markdown' });
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

    await this.getBotClient().sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  private async processAndReply(agent: IAgent, chatId: number, text: string): Promise<void> {
    try {
      await this.withTypingIndicator(chatId, async () => {
        const response = await agent.handle(text);
        const resolved = await this.resolveResponse(response);
        await this.sendMessageWithMarkdownFallback(chatId, resolved);
      });
    } catch (error) {
      console.error('Error processing message:', error);
      await this.getBotClient().sendMessage(
        chatId,
        '❌ Sorry, I encountered an error processing your message. Please try again.',
      );
    }
  }

  private async sendMessageWithMarkdownFallback(chatId: number, text: string): Promise<void> {
    try {
      await this.getBotClient().sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      if (!this.isEntityParseError(error)) {
        throw error;
      }

      await this.getBotClient().sendMessage(chatId, text);
    }
  }

  private async resolveResponse(response: unknown): Promise<string> {
    if (typeof response === 'string') {
      return stripInternalStreamMarkers(response);
    }

    if (this.isAsyncIterable(response)) {
      let out = '';
      for await (const chunk of response) {
        out += chunk;
      }

      return stripInternalStreamMarkers(out);
    }

    return String(response);
  }

  private async withTypingIndicator<T>(chatId: number, work: () => Promise<T>): Promise<T> {
    try {
      await this.getBotClient().sendChatAction(chatId, 'typing');
    } catch {
      // Silently ignore initial typing action failures - don't block the work
    }

    const timer = setInterval(() => {
      void this.getBotClient().sendChatAction(chatId, 'typing').catch(() => {
        // Silently ignore typing action refresh failures - they're not critical
        // Network issues or rate limiting shouldn't interrupt user experience
      });
    }, TYPING_INTERVAL_MS);

    try {
      return await work();
    } finally {
      clearInterval(timer);
    }
  }

  private isAsyncIterable(value: unknown): value is AsyncIterable<string> {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const maybe = value as { [Symbol.asyncIterator]?: unknown };
    return typeof maybe[Symbol.asyncIterator] === 'function';
  }

  private isEntityParseError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /can't parse entities/i.test(error.message);
  }

  private getBotClient(): TelegramBotClient {
    return this.bot ?? getBot();
  }
}

class TelegramChannelFactory {
  static create(): ITelegramChannel {
    return new TelegramChannel();
  }
}

export { ITelegramChannel, TelegramChannel, TelegramChannelFactory };
