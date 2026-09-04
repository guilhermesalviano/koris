import type { WAMessage } from '@whiskeysockets/baileys';

/** Strips everything except digits (drops `+`, spaces, dashes, parentheses). */
export function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Digits-only identifier from a WhatsApp JID, dropping the `@domain`
 * (`@s.whatsapp.net` / `@lid`) and any `:device` suffix first so those digits
 * don't bleed into the number. `"5511999998888:7@s.whatsapp.net"` -> `"5511999998888"`.
 */
export function jidToNumber(jid: string): string {
  return normalizeNumber(jid.split('@')[0].split(':')[0]);
}

function readMentionedJids(container: unknown): string[] {
  if (!container || typeof container !== 'object') return [];
  const contextInfo = (container as Record<string, unknown>)['contextInfo'];
  if (!contextInfo || typeof contextInfo !== 'object') return [];
  const mentioned = (contextInfo as Record<string, unknown>)['mentionedJid'];
  if (!Array.isArray(mentioned)) return [];
  return mentioned.filter((jid): jid is string => typeof jid === 'string');
}

/** WhatsApp mention metadata: the JIDs explicitly @-tagged in a text or image caption. */
export function extractMentionedJids(msg: WAMessage): string[] {
  if (!msg.message || typeof msg.message !== 'object') return [];
  const content = msg.message as Record<string, unknown>;
  return [
    ...readMentionedJids(content['extendedTextMessage']),
    ...readMentionedJids(content['imageMessage']),
  ];
}

/**
 * True when any of `botIds` (digit strings — the bot's phone number and/or its
 * LID) is the target of a mention, via WhatsApp's own `mentionedJid` metadata
 * or an `@<id>` token in the text. LID-addressed groups carry the bot's LID
 * here, never its phone number, so both identities have to be checked.
 */
export function isBotMentioned(text: string, mentionedJids: string[], botIds: string[]): boolean {
  const ids = botIds.filter(Boolean);
  if (ids.length === 0) return false;
  const mentionedNumbers = mentionedJids.map(jidToNumber);
  return ids.some((id) => mentionedNumbers.includes(id) || text.includes(`@${id}`));
}

/** Removes every `@<id>` token for the known bot identities and tidies whitespace. */
export function stripBotMention(text: string, botIds: string[]): string {
  let out = text;
  for (const id of botIds.filter(Boolean)) {
    out = out.split(`@${id}`).join('');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}
