import type { ILogger } from '../contracts';
import { GROUP_NAME_TTL_MS } from './constants';
import type { SocketLike } from './types';

const groupNameCache = new Map<string, { name: string; fetchedAt: number }>();

export async function resolveGroupName(sock: SocketLike, jid: string, logger: ILogger): Promise<string | undefined> {
  const cached = groupNameCache.get(jid);
  if (cached && Date.now() - cached.fetchedAt < GROUP_NAME_TTL_MS) {
    return cached.name;
  }

  try {
    const metadata = await sock.groupMetadata(jid);
    if (!metadata.subject) {
      return undefined;
    }
    groupNameCache.set(jid, { name: metadata.subject, fetchedAt: Date.now() });
    return metadata.subject;
  } catch (err) {
    logger.warn(`Failed to fetch WhatsApp group metadata for ${jid}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}
