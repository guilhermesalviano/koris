import { whatsappState } from './state';

const PN_DOMAIN = 's.whatsapp.net';

type OnWhatsApp = (...phoneNumbers: string[]) => Promise<{ jid: string; exists: boolean }[] | undefined>;

/**
 * Cheap, offline normalization of a caller-supplied recipient into a JID shape.
 *
 * Full JIDs pass through untouched — user (`<n>@s.whatsapp.net`), group
 * (`<n>@g.us`), `@lid`, `@broadcast`, `@newsletter`. A bare phone number — with
 * or without a leading `+`, a `00` international prefix, spaces, dashes,
 * parentheses, or a leading `@` (mention style) — becomes
 * `<digits>@s.whatsapp.net`. Anything with no digits and no domain is returned
 * as-is for Baileys to reject.
 */
export function toWhatsAppJid(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return trimmed;

  // A real JID looks like "<user>@<domain>" and never starts with "@".
  if (trimmed.includes('@') && !trimmed.startsWith('@')) return trimmed;

  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  return digits ? `${digits}@${PN_DOMAIN}` : trimmed;
}

/**
 * Candidate numbers to probe when the caller likely dropped the country code:
 * the digits as given, plus the bot's own leading 1–3 digits prepended (its
 * country code, whatever length) — deduped, and only when the digits don't
 * already start with that prefix.
 */
function candidateNumbers(digits: string): string[] {
  const candidates = [digits];
  const bot = whatsappState.botNumber;
  if (bot && !digits.startsWith(bot.slice(0, 2))) {
    for (const len of [1, 2, 3]) {
      const cc = bot.slice(0, len);
      if (cc && !digits.startsWith(cc)) candidates.push(cc + digits);
    }
  }
  return [...new Set(candidates)];
}

/**
 * Resolves a loosely-formatted recipient to a real WhatsApp JID. Full JIDs are
 * returned verbatim (authoritative). For a bare number, `sock.onWhatsApp` is
 * asked to canonicalize it — this fixes formatting the caller can't be expected
 * to get right (e.g. Brazil's optional 9th digit) and, when the country code is
 * missing, tries the bot's own country code in front. Falls back to the naive
 * `<digits>@s.whatsapp.net` when the lookup is unavailable or finds nothing, so
 * a send is still attempted.
 */
export async function resolveWhatsAppJid(target: string, sock: { onWhatsApp?: OnWhatsApp }): Promise<string> {
  const trimmed = target.trim();
  if (trimmed.includes('@') && !trimmed.startsWith('@')) return trimmed;

  const naive = toWhatsAppJid(trimmed);
  const digits = naive.split('@')[0];
  if (!/^\d+$/.test(digits) || typeof sock.onWhatsApp !== 'function') return naive;

  try {
    const results = (await sock.onWhatsApp(...candidateNumbers(digits))) ?? [];
    // `onWhatsApp` returns the *canonical* jid (it fixes e.g. Brazil's optional
    // 9th digit), and the candidates are ordered as-given-first, so the first
    // hit that exists is the best match.
    const hit = results.find((r) => r?.exists && r.jid);
    return hit?.jid ?? naive;
  } catch {
    return naive;
  }
}
