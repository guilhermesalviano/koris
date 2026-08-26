import type { ChannelCapabilities } from '../contracts';

export const NOT_AUTHORIZED_MESSAGE = "You're not authorized to send messages here yet. Please ask the administrator to add you to the allowed list.";
export const WHATSAPP_MESSAGE_LIMIT = 4_000;
export const TYPING_INTERVAL_MS = 5_000;
export const GROUP_NAME_TTL_MS = 60 * 60 * 1_000;
export const DEDUPE_CACHE_LIMIT = 500;

/**
 * `streaming`/`interactive` are false as-shipped: Baileys does support
 * editing a sent message (`edit?: WAMessageKey` on the send-content options,
 * verified in `node_modules` — FINDINGS.md §5) but this plugin never uses it,
 * and WhatsApp has no button affordance at all today (no approval mechanism
 * exists here, dead or otherwise, unlike Telegram's unreachable
 * `sendWithApproval`). `maxMessageChars` matches the existing
 * `WHATSAPP_MESSAGE_LIMIT` safety margin.
 */
export const WHATSAPP_CAPABILITIES: ChannelCapabilities = {
  streaming: false,
  markdown: false,
  interactive: false,
  maxMessageChars: WHATSAPP_MESSAGE_LIMIT,
};
