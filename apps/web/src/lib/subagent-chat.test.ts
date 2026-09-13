import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNegotiationCenter, buildNegotiatorChat, buildWatcherChat, headerErrand, loadNegotiatorChat, loadWatcherChat, negotiationSteps } from './subagent-chat';
import type { BeatRunItem, ErrandItem, ErrandTranscriptMessage } from './types';

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

function run(patch: Partial<BeatRunItem> = {}): BeatRunItem {
  return {
    id: 'r1', beatId: 'b1', beat: 'Send the weather', type: 'scheduled_beat', status: 'success',
    result: 'Sunny', errorMessage: null, startedAt: '2026-09-13T10:00:00Z', finishedAt: '2026-09-13T10:00:05Z', tools: [], ...patch,
  };
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

  it('opens one section per run with the task, then the Watcher result, and keeps repeated runs apart', () => {
    const second = run({ id: 'r2', startedAt: '2026-09-13T11:00:00Z', finishedAt: '2026-09-13T11:00:04Z', result: 'Rainy' });
    const entries = buildWatcherChat({ beats: [], runs: [second, run()] });
    expect(entries.map((entry) => entry.id)).toEqual(['run:r1', 'run:r1:result', 'run:r2', 'run:r2:result']);
    expect(entries[0]).toMatchObject({
      kind: 'task', section: 'Run', author: 'Scheduled task', content: 'Send the weather',
      status: 'Completed', detailsLabel: 'Run details', details: [],
    });
    expect(entries[1]).toMatchObject({ kind: 'assistant', author: 'Watcher', content: 'Sunny', at: Date.parse('2026-09-13T10:00:05Z') });
    expect(entries[3].content).toBe('Rainy');
    expect(entries[1]).not.toHaveProperty('section');
  });

  it('lists tools used, and shows failures and missing results', () => {
    const entries = buildWatcherChat({ beats: [], runs: [
      run({ type: 'reminder', tools: [{ name: 'search_engine', status: 'success' }, { name: 'read_url', status: 'error' }] }),
      run({ id: 'r2', status: 'error', result: null, errorMessage: 'model failed', startedAt: '2026-09-13T11:00:00Z', finishedAt: '2026-09-13T11:00:01Z' }),
      run({ id: 'r3', result: null, startedAt: '2026-09-13T12:00:00Z', finishedAt: '2026-09-13T12:00:01Z' }),
    ] });
    expect(entries[0]).toMatchObject({ author: 'Reminder', details: [{ label: 'Tools used', content: 'search_engine\nread_url (failed)' }] });
    expect(entries[2]).toMatchObject({ status: 'Failed', error: true });
    expect(entries[3]).toMatchObject({ content: 'model failed', error: true, status: 'Error' });
    expect(entries[5].content).toBe('No response recorded.');
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

  it('loads the beats and the latest runs for Watcher', async () => {
    const fetch = vi.fn(async (url: string) => Response.json({ items: url.includes('/runs?') ? [run()] : [] }));
    vi.stubGlobal('fetch', fetch);
    const result = await loadWatcherChat(new AbortController().signal);
    expect(result.runs).toHaveLength(1);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/admin/heartbeats', '/api/admin/heartbeats/runs?limit=20']);
  });
});

describe('negotiation steps header', () => {
  const statuses = (state: Parameters<typeof negotiationSteps>[0]) => negotiationSteps(state).map((step) => step.status);

  it('follows the newest errand still in flight, else the newest one', () => {
    const older = { ...errand, id: 'old', state: 'awaiting_peer' as const, createdAt: '2026-09-13T09:00:00Z' };
    const newerClosed = { ...errand, id: 'new', state: 'resolved' as const, createdAt: '2026-09-13T11:00:00Z' };
    expect(headerErrand([older, newerClosed])?.id).toBe('old');
    expect(headerErrand([{ ...older, state: 'failed' }, newerClosed])?.id).toBe('new');
    expect(headerErrand([])).toBeNull();
  });

  it('places the errand on Approval, Contacted, Your input or Done', () => {
    expect(negotiationSteps('draft').map((step) => step.label)).toEqual(['Approval', 'Contacted', 'Your input', 'Done']);
    expect(statuses('queued')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(statuses('awaiting_peer')).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(statuses('awaiting_principal')).toEqual(['done', 'done', 'current', 'upcoming']);
  });

  it('completes every step once closed, naming the outcome and flagging an unsuccessful one', () => {
    expect(negotiationSteps('resolved')).toEqual([
      { label: 'Approval', status: 'done' }, { label: 'Contacted', status: 'done' },
      { label: 'Your input', status: 'done' }, { label: 'Resolved', status: 'done' },
    ]);
    expect(negotiationSteps('cancelled')[3]).toEqual({ label: 'Cancelled', status: 'done', unsuccessful: true });
  });
});

describe('negotiation center', () => {
  it('lists Negotiator notices and the principal\'s answers in order, labelled with their errand', () => {
    const entries = buildNegotiationCenter([
      { id: 'n2', role: 'user', content: '11 works', createdAt: '2026-09-13T10:05:00Z', errandId: 'e1' },
      { id: 'n1', role: 'assistant', senderAgentId: 'negotiator', content: '❓ Errand "Arrange lunch" needs your input: Would 11 work?', createdAt: '2026-09-13T10:04:00Z', errandId: 'e1' },
      { id: 'n3', role: 'assistant', content: '✅ Errand "Old" resolved: Done.', createdAt: '2026-09-13T10:06:00Z', errandId: 'gone' },
    ], [errand]);
    expect(entries).toEqual([
      { id: 'notice:n1', at: Date.parse('2026-09-13T10:04:00Z'), kind: 'assistant', author: 'Negotiator', context: 'Arrange lunch', content: 'I need your input on “Arrange lunch”.\n\nWould 11 work?' },
      { id: 'notice:n2', at: Date.parse('2026-09-13T10:05:00Z'), kind: 'contact', author: 'You', context: 'Arrange lunch', content: '11 works' },
      { id: 'notice:n3', at: Date.parse('2026-09-13T10:06:00Z'), kind: 'assistant', author: 'Negotiator', context: 'gone', content: "I've completed “Old”.\n\nDone." },
    ]);
  });
});
