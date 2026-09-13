import { mapMessages, type ChatMessage, type HistoryMessage } from './chat-history';
import { chatSeparatorLabel, dayTimeLabel } from './date';

export type SessionStartReason = 'idle' | 'clear' | 'compact';

/** A session as the Orchestrator thread needs it: enough to draw its boundary. */
export interface TimelineSession {
  id: string;
  startedAt?: string | null;
  endedAt?: string | null;
  startReason: SessionStartReason | null;
  compactSummary: string | null;
}

export interface TimelineResponse {
  messages: HistoryMessage[];
  sessions: TimelineSession[];
  activeSessionId: string | null;
  nextCursor: string | null;
}

export interface NewSessionResponse {
  session: { id: string; startedAt?: string; endedAt?: string; metadata: Record<string, unknown> };
  rotated: boolean;
}

export type SessionMap = Readonly<Record<string, TimelineSession>>;

export interface SessionDivider {
  kind: 'session';
  label: string;
  reason: SessionStartReason | null;
  /** The summary a compacted session resumed from. */
  summary: string | null;
}

export type ThreadDivider = { kind: 'time'; label: string } | SessionDivider;

export interface ThreadItem {
  message: ChatMessage;
  divider: ThreadDivider | null;
}

const START_REASONS: readonly SessionStartReason[] = ['idle', 'clear', 'compact'];

/** Server-authoritative: an incoming session replaces the known copy. */
export function mergeSessions(current: SessionMap, incoming: readonly TimelineSession[]): SessionMap {
  if (incoming.length === 0) return current;
  const next: Record<string, TimelineSession> = { ...current };
  for (const session of incoming) next[session.id] = session;
  return next;
}

/** The thread's view of a session returned by `POST /agents/orchestrator/new-session`. */
export function sessionFromNewSession({ session }: NewSessionResponse): TimelineSession {
  const reason = session.metadata.startReason;
  return {
    id: session.id,
    startedAt: session.startedAt ?? null,
    endedAt: session.endedAt ?? null,
    startReason: START_REASONS.includes(reason as SessionStartReason) ? (reason as SessionStartReason) : null,
    compactSummary: null,
  };
}

/**
 * Adds an older page above what is loaded. Unlike `mergeMessages`, it never lets
 * an old saved message claim a local optimistic one with the same text.
 */
export function prependOlder(current: ChatMessage[], older: HistoryMessage[]): ChatMessage[] {
  const known = new Set(current.flatMap((m) => (m.serverId ? [m.serverId] : [])));
  const fresh = mapMessages(older.filter((m) => !known.has(m.id)));
  if (fresh.length === 0) return current;
  return [...fresh, ...current].sort((a, b) => a.at - b.at);
}

function sessionDivider(session: TimelineSession | undefined, fallbackAt: number, now: number): SessionDivider {
  const startedAt = session?.startedAt ? Date.parse(session.startedAt) : NaN;
  const at = Number.isFinite(startedAt) ? startedAt : fallbackAt;
  const reason = session?.startReason ?? null;
  const prefix = reason === 'clear' ? 'Cleared' : reason === 'compact' ? 'Compacted' : 'New session';
  return {
    kind: 'session',
    label: `${prefix} · ${dayTimeLabel(at, now)}`,
    reason,
    summary: reason === 'compact' ? session?.compactSummary ?? null : null,
  };
}

/**
 * Lays out the Orchestrator thread: each message with the divider above it, plus
 * a trailing divider when the open session has not received a message yet (right
 * after "New session").
 *
 * A message without a `sessionId` (a local turn not yet tied to one) belongs to
 * the session before it. The first loaded message only gets a time label: whether
 * it starts its session is unknown until the page above it loads.
 */
export function buildThread(
  messages: readonly ChatMessage[],
  sessions: SessionMap,
  activeSessionId: string | null,
  now: number = Date.now(),
): { items: ThreadItem[]; trailing: SessionDivider | null } {
  let prevSessionId: string | undefined;
  let prevAt: number | undefined;
  const seen = new Set<string>();

  const items = messages.map((message, index) => {
    const sessionId = message.sessionId ?? prevSessionId;
    let divider: ThreadDivider | null;

    if (index > 0 && sessionId && prevSessionId && sessionId !== prevSessionId) {
      divider = sessionDivider(sessions[sessionId], message.at, now);
    } else {
      const label = chatSeparatorLabel(message.at, index === 0 ? undefined : prevAt, now);
      divider = label ? { kind: 'time', label } : null;
    }

    if (sessionId) seen.add(sessionId);
    prevSessionId = sessionId;
    prevAt = message.at;
    return { message, divider };
  });

  const trailing = activeSessionId && messages.length > 0 && !seen.has(activeSessionId)
    ? sessionDivider(sessions[activeSessionId], now, now)
    : null;

  return { items, trailing };
}

/** Where to put scrollTop after content was inserted above the viewport, so what
 * the reader was looking at stays in place. */
export function anchoredScrollTop(prevScrollHeight: number, currentScrollTop: number, newScrollHeight: number): number {
  return currentScrollTop + (newScrollHeight - prevScrollHeight);
}

export const NEAR_BOTTOM_PX = 80;

export function isNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold: number = NEAR_BOTTOM_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
