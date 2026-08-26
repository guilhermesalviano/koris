import { DEDUPE_CACHE_LIMIT } from './constants';

// Baileys replays recent `messages.upsert` events after a reconnect
// (FINDINGS.md §3.4) — bounded FIFO of recently-seen `key.id`s so a replay
// is dropped before it re-triggers the agent pipeline or a duplicate reply.
const seenMessageIds = new Set<string>();
const seenMessageIdsOrder: string[] = [];

export function isDuplicateMessage(externalId: string | null | undefined): boolean {
  if (!externalId) return false;
  if (seenMessageIds.has(externalId)) return true;

  seenMessageIds.add(externalId);
  seenMessageIdsOrder.push(externalId);
  if (seenMessageIdsOrder.length > DEDUPE_CACHE_LIMIT) {
    const oldest = seenMessageIdsOrder.shift();
    if (oldest !== undefined) seenMessageIds.delete(oldest);
  }
  return false;
}

/** @internal — only for use in tests */
export function _resetWhatsAppDedupeForTesting(): void {
  seenMessageIds.clear();
  seenMessageIdsOrder.length = 0;
}
