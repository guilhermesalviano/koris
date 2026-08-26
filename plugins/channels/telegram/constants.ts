import type { ChannelCapabilities } from '../contracts';

export const NOT_AUTHORIZED_MESSAGE = "You're not authorized to send messages here yet. Please ask the administrator to add you to the allowed list.";
export const TYPING_INTERVAL_MS = 5_000;
export const TELEGRAM_MESSAGE_LIMIT = 4_000;

/**
 * `streaming: true` reflects that the installed `@guilhermesalviano/telegram-bot`
 * client genuinely exposes `editMessageText` (verified in `node_modules`, see
 * FINDINGS.md §5) — not that this plugin currently edits messages in place.
 * Nothing in the pipeline emits real per-token deltas yet (FINDINGS.md §3.7),
 * so this capability is declared but unexercised until that lands.
 *
 * `interactive: false` despite `sendWithApproval`'s inline keyboard existing:
 * the vendor client fetches `callback_query` updates but never dispatches
 * them (no way to register a handler for them at all — FINDINGS.md §3.5), so
 * a button press can't currently be received. `maxMessageChars` keeps the
 * existing 4000 safety margin under Telegram's real 4096 limit, matching
 * `TELEGRAM_MESSAGE_LIMIT` above rather than the raw API ceiling.
 */
export const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  streaming: true,
  markdown: true,
  interactive: false,
  maxMessageChars: TELEGRAM_MESSAGE_LIMIT,
};

export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
};
