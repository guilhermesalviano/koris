import { ExtensionPoint } from './registry';

export { ExtensionPoint };
export type { Plugin } from './registry';

export interface ImageAttachment {
  data: string;
  mimeType?: string;
}

/**
 * A pointer to a sticker on the channel's own servers (e.g. WhatsApp's media
 * CDN), captured from a quoted/replied-to message. Carries no decoded bytes —
 * `key`/`message` are exactly what the channel needs to re-send the sticker
 * by reference later (e.g. WhatsApp's "forward" mechanism).
 */
export interface StickerReference {
  key: {
    remoteJid: string;
    id?: string;
    participant?: string;
    fromMe: boolean;
  };
  message: unknown;
  mimeType?: string;
}

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export type ProcessedMessage = string;
export type ProcessOptions = {
  signal?: AbortSignal;
  toolsEnabled?: boolean;
  learnedSkillsEnabled?: boolean;
  stickersEnabled?: boolean;
  onProgress?: (summary: string) => void;
  sessionId?: string;
  runId?: string;
  channel?: string;
};

export type InboundInput = string | { text: string; images?: ImageAttachment[]; stickers?: StickerReference[] };

export interface IMessageGateway {
  handle(input: InboundInput, originId: string, options?: ProcessOptions): Promise<ProcessedMessage>;
}

export interface ChannelDefinition {
  name: string;
  enabled: () => boolean;
  start: (logger: ILogger, gateway: IMessageGateway) => (() => void) | void;
  sendMessage?: (logger: ILogger, target: string, message: string) => Promise<void>;
  sendSticker?: (logger: ILogger, target: string, sticker: StickerReference) => Promise<void>;
}

export interface InboundChannelMessage {
  text: string;
  senderName?: string;
  images?: ImageAttachment[];
  stickers?: StickerReference[];
  isGroup: boolean;
  mentionsBot: boolean;
  isTrustedSender: boolean;
  mentionId?: string;
  groupName?: string;
}

export interface ChannelReply {
  sendText(target: string, text: string): Promise<void>;
  sendError(target: string, message: string): Promise<void>;
}

export interface ChannelHandlerOptions {
  channel: string;
  gateway: IMessageGateway;
  reply: ChannelReply;
  mentionId?: string;
  prefixSenderName?: boolean;
}

export interface IChannelHandler {
  handle(target: string, message: InboundChannelMessage): Promise<boolean>;
}

export interface IChannelHandlerFactory {
  create(options: ChannelHandlerOptions): IChannelHandler;
}

export const ADAPTERS = new ExtensionPoint<ChannelDefinition>('channels.adapters');

export function splitMessage(text: string, maxLength: number): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitIndex = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const end = splitIndex > 0 ? splitIndex : maxLength;

    chunks.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export interface ChannelsConfig {
  ALLOW_UNTRUSTED: boolean;
  TELEGRAM: {
    ENABLED: boolean;
    BOT_TOKEN: string;
    WHITELIST: string;
  };
  WHATSAPP: {
    ENABLED: boolean;
    AUTH_FOLDER: string;
    WHITELIST: string;
    MENTION_ID: string;
  };
}

export interface AppConfig {
  channels: ChannelsConfig;
}

export interface PluginContext {
  config: AppConfig;
  logger: ILogger;
  gateway: IMessageGateway;
  channelHandler: IChannelHandlerFactory;
}