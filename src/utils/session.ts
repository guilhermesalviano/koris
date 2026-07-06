export function isSessionExpired(
  lastActivityAt: string | undefined,
  ttlMs: number,
  now: number = Date.now(),
): boolean {
  if (!lastActivityAt) {
    return true;
  }

  return now - new Date(lastActivityAt).getTime() > ttlMs;
}

export function getLastActivityAt(session: {
  startedAt?: string;
  metadata?: Record<string, unknown>;
}): string | undefined {
  const fromMetadata = session.metadata?.lastActivityAt;
  if (typeof fromMetadata === 'string') {
    return fromMetadata;
  }

  return session.startedAt;
}
