import { TelegramMessage, InlineKeyboardMarkup } from 'assistant-telegram-bot';
import { getBot } from 'assistant-telegram-bot';
import { IAgent } from '../../services/agents/main-agent/agent';
import { ILogger } from '../../infrastructure/logger';
import { stripInternalStreamMarkers } from '../../utils/stream-markers';

const TYPING_INTERVAL_MS = 5_000;

function isAsyncIterable(value: unknown): value is AsyncIterable<string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { [Symbol.asyncIterator]?: unknown };
  return typeof maybe[Symbol.asyncIterator] === 'function';
}

function isEntityParseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /can't parse entities/i.test(error.message);
}

async function sendMessageWithMarkdownFallback(chatId: number, text: string): Promise<void> {
  const bot = getBot();
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    if (!isEntityParseError(error)) throw error;
    await bot.sendMessage(chatId, text);
  }
}

async function resolveResponse(response: unknown): Promise<string> {
  if (typeof response === 'string') return stripInternalStreamMarkers(response);
  if (isAsyncIterable(response)) {
    let out = '';
    for await (const chunk of response) out += chunk;
    return stripInternalStreamMarkers(out);
  }
  return String(response);
}

async function withTypingIndicator<T>(chatId: number, work: () => Promise<T>): Promise<T> {
  const bot = getBot();
  
  try {
    await bot.sendChatAction(chatId, 'typing');
  } catch {
    // Silently ignore initial typing action failures - don't block the work
  }

  const timer = setInterval(() => {
    void bot.sendChatAction(chatId, 'typing').catch(() => {
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

async function processAndReply(agent: IAgent, chatId: number, text: string): Promise<void> {
  const bot = getBot();
  try {
    await withTypingIndicator(chatId, async () => {
      const response = await agent.handle(text);
      const resolved = await resolveResponse(response);
      await sendMessageWithMarkdownFallback(chatId, resolved);
    });
  } catch (error) {
    console.error('Error processing message:', error);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, I encountered an error processing your message. Please try again.'
    );
  }
}

export async function handleMessage(agent: IAgent, msg: TelegramMessage): Promise<void> {
  const { id: chatId } = msg.chat;
  const { text } = msg;

  if (text) {
    await processAndReply(agent, chatId, text);
  }
}

export async function sendCode(
  chatId: number,
  code: string,
  language: string = ''
): Promise<void> {
  const bot = getBot();
  await bot.sendMessage(chatId, `\`\`\`${language}\n${code}\n\`\`\``, { parse_mode: 'Markdown' });
}

export async function sendWithApproval(
  logger: ILogger,
  chatId: number,
  message: string,
  callbackData: string
): Promise<void> {
  logger.info(`Sending message with approval to chat ${chatId}: ${message}`);
  const bot = getBot();
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${callbackData}` },
        { text: '❌ Reject', callback_data: `reject:${callbackData}` },
      ],
    ],
  };

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
}
