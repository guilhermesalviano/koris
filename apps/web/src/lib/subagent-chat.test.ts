import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNegotiatorChat, buildWatcherChat, loadNegotiatorChat, loadWatcherChat } from './subagent-chat';
import type { AuditItem, ErrandItem, ErrandTranscriptMessage } from './types';

const errand: ErrandItem = {
  id: 'e1', goal: 'Arrange lunch', state: 'open', originSessionId: 'origin', pendingMessage: null,
  delivery: null, notes: null, result: null, createdAt: '2026-09-13T10:00:00Z', lastProgressAt: null, closedAt: null,
  targets: [
    { sessionId: 's1', channel: 'channel-a', peerId: 'Alice', kind: 'errand', messageCount: 2, startedAt: null, endedAt: null },
    { sessionId: 's2', channel: 'channel-b', peerId: 'Bob', kind: 'errand', messageCount: 1, startedAt: null, endedAt: null },
  ],
};

const message: ErrandTranscriptMessage = {
  id: 'm1', sessionId: 's1', role: 'user', content: 'Tomorrow works.', createdAt: '2026-09-13T10:01:00Z',
};

function run(patch: Partial<AuditItem> = {}): AuditItem {
  return { id: 'r1', runId: 'b1', type: 'llm', role: 'worker', status: 'success', durationMs: 10, createdAt: '2026-09-13T10:00:00Z', ...patch };
}

afterEach(() => vi.unstubAllGlobals());

describe('subagent timelines', () => {
  it('merges errands chronologically and attributes contacts by session without duplicate messages', () => {
    const entries = buildNegotiatorChat([
      { errand: { ...errand, id: 'e2', goal: 'Later task', createdAt: '2026-09-13T11:00:00Z' }, messages: [] },
      { errand, messages: [
        { ...message, id: 'm3', sessionId: 's2', createdAt: '2026-09-13T10:03:00Z' },
        message, message,
        { ...message, id: 'm2', role: 'assistant', createdAt: '2026-09-13T10:02:00Z' },
      ] },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(['errand:e1', 'message:s1:m1', 'message:s1:m2', 'message:s2:m3', 'errand:e2']);
    expect(entries[1]).toMatchObject({ author: 'Alice · channel-a', kind: 'contact' });
    expect(entries[2]).toMatchObject({ author: 'Negotiator', kind: 'assistant', context: 'Arrange lunch · Alice · channel-a' });
    expect(entries[3]).toMatchObject({ author: 'Bob · channel-b', kind: 'contact' });
  });

  it('keeps current metadata separate from sent conversation and identifies missing transcripts', () => {
    const entries = buildNegotiatorChat([{ errand: { ...errand, state: 'draft', pendingMessage: 'Hello', result: 'Saved result', notes: 'A note' }, messages: [], error: 'Offline' }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'task', status: 'Awaiting approval', error: true });
    expect(entries[0].details).toContainEqual({ label: 'Unsent draft', content: 'Hello' });
    expect(entries[0].details).toContainEqual({ label: 'Result', content: 'Saved result' });
    expect(entries[0].details).toContainEqual({ label: 'Conversation unavailable', content: 'Offline' });
  });

  it('does not mislabel unknown message roles or missing contacts', () => {
    const entries = buildNegotiatorChat([{ errand, messages: [{ ...message, role: 'tool' }, { ...message, id: 'unknown', sessionId: 'missing' }] }]);
    expect(entries.find((entry) => entry.id === 'message:s1:m1')).toMatchObject({ kind: 'activity', author: 'Recorded tool activity' });
    expect(entries.find((entry) => entry.id === 'message:missing:unknown')?.author).toBe('Contact · missing');
  });

  it('keeps repeated Watcher runs distinct, deduplicates by audit id, and uses full responses', () => {
    const first = run({ response: 'Full response', responsePreview: 'Full…', prompt: 'Private system instructions' });
    const second = run({ id: 'r2', createdAt: '2026-09-13T11:00:00Z', response: 'Another run' });
    const entries = buildWatcherChat({ beats: [], runs: [second, first, first] });
    expect(entries.map((entry) => entry.id)).toEqual(['audit:r1', 'audit:r2']);
    expect(entries[0]).toMatchObject({ content: 'Full response', context: 'Scheduled task · b1' });
    expect(JSON.stringify(entries)).not.toContain('Private system instructions');
  });

  it('separates tool payloads from chat prose and preserves failures', () => {
    const payload = '[{"name":"search","arguments":{"query":"weather"}}]';
    const entries = buildWatcherChat({ beats: [], runs: [
      run({ toolCalls: 1, response: payload }),
      run({ id: 'r2', status: 'error', errorCode: 'timeout', responsePreview: 'Not a successful response' }),
      run({ id: 'r3', responsePreview: 'Legacy preview' }),
    ] });
    expect(entries[0]).toMatchObject({ kind: 'activity', content: 'Tool activity', details: [{ label: 'Recorded tool activity', content: payload }] });
    expect(entries[1]).toMatchObject({ error: true, content: 'timeout' });
    expect(entries[2].content).toBe('Legacy preview');
  });
});

describe('read-only history loading', () => {
  it('limits transcript concurrency to four and preserves failed transcripts on refresh', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ ...errand, id: `e${index}` }));
    let active = 0;
    let peak = 0;
    const pending: (() => void)[] = [];
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      expect(options.method ?? 'GET').toBe('GET');
      if (url.endsWith('/errands?limit=50')) return Response.json({ items });
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => pending.push(resolve));
      active--;
      return url.includes('/e1/') ? Response.json({ error: 'Contact unavailable' }, { status: 503 }) : Response.json({ messages: [message] });
    });
    vi.stubGlobal('fetch', fetch);
    const result = loadNegotiatorChat(new AbortController().signal, [{ errand: items[1], messages: [message] }]);
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    pending.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending.splice(0).forEach((resolve) => resolve());
    const conversations = await result;
    expect(peak).toBe(4);
    expect(conversations).toHaveLength(6);
    expect(conversations[1]).toMatchObject({ messages: [message], error: 'Contact unavailable' });
    expect(conversations[5].messages).toEqual([message]);
  });

  it('stops scheduling transcripts after abort', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      return Response.json({ items: [errand] });
    });
    vi.stubGlobal('fetch', fetch);
    await expect(loadNegotiatorChat(controller.signal, null)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads only existing read endpoints for Watcher', async () => {
    const fetch = vi.fn(async (url: string) => Response.json({ items: url.includes('/audit?') ? [run()] : [] }));
    vi.stubGlobal('fetch', fetch);
    const result = await loadWatcherChat(new AbortController().signal);
    expect(result.runs).toHaveLength(1);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/admin/heartbeats', '/api/admin/audit?agentName=heartbeat&limit=20']);
  });
});
