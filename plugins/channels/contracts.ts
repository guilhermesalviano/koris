import { ExtensionPoint } from '../registry';

export { ExtensionPoint };
export type { Plugin } from '../registry';

export interface ImageAttachment {
  data: string;
  mimeType?: string;
  /** Where this image came from: attached to the current message, or from a quoted/replied-to message. Absent means 'current'. */
  source?: 'current' | 'quoted';
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

/**
 * What a channel can actually do, so core can degrade behavior once instead
 * of branching on channel identity (see AGENTS.md / FINDINGS.md §2.8 for the
 * `source === 'telegram'` conditionals this is meant to eventually replace).
 * Optional on `ChannelDefinition` for now — additive; neither plugin declares
 * it yet, and everything that reads it must treat its absence as "assume the
 * least capable channel" (no streaming, no markdown, no interactive buttons).
 */
export interface ChannelCapabilities {
  /** Can this channel edit a message it already sent, in place? */
  streaming: boolean;
  /** Does this channel render Markdown-ish formatting in message text? */
  markdown: boolean;
  /** Does this channel have a real, clickable-button affordance for approvals? */
  interactive: boolean;
  /** The channel's real per-message character ceiling, for `splitMessage`. */
  maxMessageChars: number;
}

/**
 * An outbound byte payload a channel can send back — e.g. a generated image
 * or document. Distinct from `ImageAttachment` (inbound-only, includes
 * `source: 'quoted'`) and `StickerReference` (a pointer, no bytes): this is
 * the outbound counterpart introduced for `OutboundEvent`.
 */
export interface Attachment {
  data: string;
  mimeType?: string;
  filename?: string;
}

/**
 * Closed set of things a channel can be asked to send. Additive, unused by
 * either plugin today — Phase 3/4 wire real channels onto it. Each channel's
 * `send`/`switch` over this type should end in a `default: assertNeverOutboundEvent(event)`
 * branch so a new variant fails the build instead of silently doing nothing.
 */
export type OutboundEvent =
  | { type: 'delta'; text: string }
  | { type: 'message'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'ok' | 'error'; summary?: string }
  | { type: 'approval'; id: string; prompt: string; options: string[] }
  | { type: 'attachment'; attachment: Attachment; caption?: string }
  | { type: 'error'; message: string }
  | { type: 'turn_end' };

/**
 * Exhaustiveness helper for a `switch` over `OutboundEvent`. Put this in the
 * `default` branch (typed as `never`) so adding a new `OutboundEvent` variant
 * is a compile error in every channel that switches over it, not a silent
 * no-op — see Definition of Done: "Adding an `OutboundEvent` variant causes a
 * type error in both plugins."
 */
export function assertNeverOutboundEvent(event: never): never {
  throw new Error(`Unhandled OutboundEvent: ${JSON.stringify(event)}`);
}

/**
 * Target lifecycle shape for a channel plugin instance — generalizes today's
 * `ChannelDefinition.start(logger, gateway) => stop?` plus the separate
 * `sendMessage?`/`sendSticker?` methods into a single `send(target, event)`
 * over the closed `OutboundEvent` union. Additive: `ChannelDefinition` keeps
 * working exactly as today; this describes what Phase 3/4 migrate each
 * plugin's `create()` to return, and what a future 3rd channel can implement
 * directly instead of the older shape.
 */
export interface ChannelInstance {
  start(): void | Promise<void>;
  send(target: string, event: OutboundEvent): Promise<void>;
  stop(): void | Promise<void>;
}

export interface ChannelDefinition {
  name: string;
  enabled: () => boolean;
  start: (logger: ILogger, gateway: IMessageGateway) => (() => void) | void;
  sendMessage?: (logger: ILogger, target: string, message: string) => Promise<void>;
  sendSticker?: (logger: ILogger, target: string, sticker: StickerReference) => Promise<void>;
  /** Optional today — see `ChannelCapabilities`. Absence means "assume the least capable channel." */
  capabilities?: ChannelCapabilities;
}

export interface InboundChannelMessage {
  text: string;
  senderName?: string;
  images?: ImageAttachment[];
  stickers?: StickerReference[];
  /** Text of the message being replied to/quoted, if any. */
  quotedText?: string;
  isGroup: boolean;
  mentionsBot: boolean;
  isTrustedSender: boolean;
  mentionId?: string;
  groupName?: string;
  /**
   * The channel's own id for this specific message (Telegram `message_id`,
   * Baileys `key.id`) — optional today; needed for the dedupe work in
   * FINDINGS.md §3.4 (Baileys replays `messages.upsert` after reconnect).
   * Neither plugin sets this yet.
   */
  externalId?: string;
  /**
   * The channel's native conversation id (Telegram chat id, WhatsApp JID) —
   * optional today, distinct from the `target`/`originId` string `handle()`
   * already receives, for cases where a message needs to carry its own
   * conversation identity independent of the delivery target.
   */
  conversationId?: string;
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

export interface PluginContext {
  /** Cross-channel security policy: allow senders outside a channel's own whitelist. */
  allowUntrusted: boolean;
  logger: ILogger;
  gateway: IMessageGateway;
  channelHandler: IChannelHandlerFactory;
}