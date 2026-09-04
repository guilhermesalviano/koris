import { CONTACT_NAME_CACHE_LIMIT } from './constants';
import { jidToNumber } from './mention';

// Baileys never tells us the display name of a *mentioned* user — only the
// sender's `pushName`. So we passively cache every sender's name (keyed by
// their normalized number / LID) as messages arrive, then look mentions up
// against it. Bounded FIFO, same shape as `dedupe.ts`.
const names = new Map<string, string>();
const order: string[] = [];

function remember(number: string, name: string): void {
  if (!number || !name) return;
  if (names.has(number)) {
    names.set(number, name);
    return;
  }
  names.set(number, name);
  order.push(number);
  if (order.length > CONTACT_NAME_CACHE_LIMIT) {
    const oldest = order.shift();
    if (oldest !== undefined) names.delete(oldest);
  }
}

/** Records `name` for every jid form we might later see in a `mentionedJid`. */
export function rememberContactName(
  jids: (string | null | undefined)[],
  name: string | null | undefined,
): void {
  const trimmed = name?.trim();
  if (!trimmed) return;
  for (const jid of jids) {
    if (jid) remember(jidToNumber(jid), trimmed);
  }
}

export function lookupContactName(number: string): string | undefined {
  return names.get(number);
}

/**
 * Rewrites `@<number>` mention tokens in the text to `@<name>` for every
 * mentioned user whose name we've cached. The bot's own ids are skipped (its
 * token is stripped separately), and unknown users are left as `@<number>`.
 */
export function applyMentionNames(text: string, mentionedJids: string[], botIds: string[]): string {
  const skip = new Set(botIds.filter(Boolean));
  let out = text;
  for (const jid of mentionedJids) {
    const number = jidToNumber(jid);
    if (!number || skip.has(number)) continue;
    const name = lookupContactName(number);
    if (!name) continue;
    out = out.split(`@${number}`).join(`@${name}`);
  }
  return out;
}

/** @internal — only for use in tests */
export function _resetContactNamesForTesting(): void {
  names.clear();
  order.length = 0;
}
