import type { WAMessage } from '@whiskeysockets/baileys';
import { whatsappState } from './state';

export function isWhitelistedSender(msg: WAMessage): boolean {
  const key = msg.key;
  if (!key) return false;

  const candidates = [
    key.participantAlt,
    key.remoteJidAlt,
    key.participant ?? undefined,
    key.remoteJid ?? undefined,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (whatsappState.whitelist.length === 0) {
    return false;
  }

  return candidates.some((candidate) =>
    whatsappState.whitelist.some((number) => candidate.includes(number)),
  );
}
