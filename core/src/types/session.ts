export const SESSION_KINDS = ['user', 'delegated'] as const;
export type SessionKind = typeof SESSION_KINDS[number];

/** Identifies a conversation thread: the channel it lives on, the peer it's
 * with, and whether it's the principal's own conversation or one koris is
 * running on their behalf. Replaces the old opaque `entryChannel` string,
 * which could not distinguish "the WhatsApp chat with contact X" from "the
 * web channel" or express "list every WhatsApp chat". */
export interface SessionKey {
  channel: string;
  peerId: string;
  kind?: SessionKind;
}
