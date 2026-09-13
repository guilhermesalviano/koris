import { describe, expect, it } from 'vitest';
import { mapMessages, nextId, type ChatMessage, type HistoryMessage } from './chat-history';
import {
  anchoredScrollTop,
  buildThread,
  isNearBottom,
  mergeSessions,
  prependOlder,
  sessionFromNewSession,
  type TimelineSession,
} from './timeline';

// Local-time constructors and a fixed `now`, as in date.test.ts, so labels don't
// depend on the machine's timezone. Assertions look at prefixes and day words.
const NOW = new Date(2026, 8, 5, 18, 0).getTime();
const at = (hour: number, minute = 0) => new Date(2026, 8, 5, hour, minute).getTime();
const iso = (hour: number, minute = 0) => new Date(at(hour, minute)).toISOString();

function saved(id: string, sessionId: string, hour: number, minute = 0, content = id): HistoryMessage {
  return { id, sessionId, role: 'user', content, createdAt: iso(hour, minute) };
}

function session(id: string, props: Partial<TimelineSession> = {}): TimelineSession {
  return { id, startedAt: null, endedAt: null, startReason: null, compactSummary: null, ...props };
}

describe('buildThread', () => {
  it('gives the first message a day label and closely-spaced followers none', () => {
    const messages = mapMessages([saved('a', 's1', 10), saved('b', 's1', 10, 5)]);

    const { items, trailing } = buildThread(messages, {}, 's1', NOW);

    expect(items[0].divider).toMatchObject({ kind: 'time' });
    expect(items[0].divider?.label).toMatch(/^Today /);
    expect(items[1].divider).toBeNull();
    expect(trailing).toBeNull();
  });

  it('keeps the hour gap separator inside one session', () => {
    const messages = mapMessages([saved('a', 's1', 10), saved('b', 's1', 12)]);

    const { items } = buildThread(messages, {}, 's1', NOW);

    expect(items[1].divider?.kind).toBe('time');
  });

  it('marks a session boundary even when it follows within the hour, labelled by start reason', () => {
    const messages = mapMessages([
      saved('a', 's1', 10),
      saved('b', 's2', 10, 5),
      saved('c', 's3', 10, 10),
      saved('d', 's4', 10, 15),
    ]);
    const sessions = mergeSessions({}, [
      session('s2', { startReason: 'clear', startedAt: iso(10, 4) }),
      session('s3', { startReason: 'compact', compactSummary: 'we planned the trip' }),
      session('s4', { startReason: 'idle' }),
    ]);

    const { items } = buildThread(messages, sessions, 's4', NOW);

    expect(items[1].divider).toMatchObject({ kind: 'session', reason: 'clear', summary: null });
    expect(items[1].divider?.label).toMatch(/^Cleared · Today /);
    expect(items[2].divider).toMatchObject({ kind: 'session', reason: 'compact', summary: 'we planned the trip' });
    expect(items[2].divider?.label).toMatch(/^Compacted · /);
    expect(items[3].divider?.label).toMatch(/^New session · /);
  });

  it('falls back to "New session" for a session it knows nothing about', () => {
    const messages = mapMessages([saved('a', 's1', 10), saved('b', 's2', 11)]);

    const { items } = buildThread(messages, {}, 's2', NOW);

    expect(items[1].divider).toMatchObject({ kind: 'session', reason: null });
    expect(items[1].divider?.label).toMatch(/^New session · /);
  });

  it('never marks the first loaded message as a session start', () => {
    const messages = mapMessages([saved('b', 's2', 10, 5)]);
    const sessions = mergeSessions({}, [session('s2', { startReason: 'clear' })]);

    expect(buildThread(messages, sessions, 's2', NOW).items[0].divider?.kind).toBe('time');
  });

  it('lets a local message without a session inherit the one before it', () => {
    const local: ChatMessage = { id: nextId(), role: 'user', content: 'hi', timestamp: '', at: at(10, 1) };
    const messages = [...mapMessages([saved('a', 's1', 10)]), local];

    expect(buildThread(messages, {}, 's1', NOW).items[1].divider).toBeNull();
  });

  it('adds a trailing divider for an open session with no messages yet', () => {
    const messages = mapMessages([saved('a', 's1', 10)]);
    const sessions = mergeSessions({}, [session('s2', { startReason: 'clear', startedAt: iso(17, 30) })]);

    const { trailing } = buildThread(messages, sessions, 's2', NOW);

    expect(trailing).toMatchObject({ kind: 'session', reason: 'clear' });
    expect(trailing?.label).toMatch(/^Cleared · Today /);
  });

  it('shows no trailing divider on an empty thread', () => {
    expect(buildThread([], {}, 's1', NOW).trailing).toBeNull();
  });
});

describe('prependOlder', () => {
  it('puts an older page above the loaded messages, skipping ones already loaded', () => {
    const current = mapMessages([saved('c', 's2', 11), saved('d', 's2', 12)]);

    const merged = prependOlder(current, [saved('a', 's1', 9), saved('b', 's1', 10), saved('c', 's2', 11)]);

    expect(merged.map((m) => m.serverId)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged[2]).toBe(current[0]);
  });

  it('returns the same array when nothing is new', () => {
    const current = mapMessages([saved('a', 's1', 9)]);

    expect(prependOlder(current, [saved('a', 's1', 9)])).toBe(current);
  });

  it('does not let an old message claim a local unsaved message with the same text', () => {
    const local: ChatMessage = { id: nextId(), role: 'user', content: 'hi', timestamp: '', at: at(17) };

    const merged = prependOlder([local], [saved('old-hi', 's1', 9, 0, 'hi')]);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toBe(local);
    expect(merged[1].serverId).toBeUndefined();
  });
});

describe('mergeSessions', () => {
  it('replaces known sessions with the server copy and keeps the rest', () => {
    const current = mergeSessions({}, [session('s1'), session('s2')]);

    const next = mergeSessions(current, [session('s2', { startReason: 'compact' })]);

    expect(next.s1).toBe(current.s1);
    expect(next.s2.startReason).toBe('compact');
    expect(mergeSessions(current, [])).toBe(current);
  });
});

describe('sessionFromNewSession', () => {
  it('reads the start reason from metadata and ignores unknown values', () => {
    expect(sessionFromNewSession({ rotated: true, session: { id: 'n', metadata: { startReason: 'clear' } } }))
      .toMatchObject({ id: 'n', startReason: 'clear', compactSummary: null });
    expect(sessionFromNewSession({ rotated: false, session: { id: 'n', metadata: { startReason: 'bogus' } } }).startReason)
      .toBeNull();
  });
});

describe('scroll helpers', () => {
  it('keeps the viewport in place when content is added above it', () => {
    expect(anchoredScrollTop(1000, 40, 1600)).toBe(640);
  });

  it('treats a position within the threshold of the end as at the bottom', () => {
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 530 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 400 })).toBe(false);
  });
});
