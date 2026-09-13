import { apiRequest } from './api';
import type { BeatRunItem, BeatRunsResponse, ErrandItem, ErrandState, ErrandsResponse, ErrandTranscriptMessage, ErrandTranscriptResponse, HeartbeatItem, HeartbeatsResponse } from './types';

export interface ReadOnlyChatEntry {
  id: string;
  at: number;
  kind: 'assistant' | 'contact' | 'task' | 'activity';
  author: string;
  context: string;
  content: string;
  error?: boolean;
  status?: string;
  details?: { label: string; content: string }[];
  /** Title of the collapsed details on this entry; task entries default to the errand wording. */
  detailsLabel?: string;
  /** Opens a new chat section (e.g. "New errand"), shown with the entry's time in an accented divider. */
  section?: string;
}

export interface ErrandConversation {
  errand: ErrandItem;
  messages: ErrandTranscriptMessage[];
  error?: string;
}

export interface WatcherHistory {
  beats: HeartbeatItem[];
  runs: BeatRunItem[];
}

const ERRAND_STATUS: Record<ErrandState, string> = {
  draft: 'Awaiting approval',
  queued: 'Queued',
  open: 'In progress',
  awaiting_peer: 'Waiting on contact',
  awaiting_principal: 'Waiting on you',
  resolved: 'Resolved',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const CLOSED_ERRAND_STATES: readonly ErrandState[] = ['resolved', 'failed', 'cancelled', 'expired'];

export interface NegotiationStep {
  label: string;
  status: 'done' | 'current' | 'upcoming';
  /** Set on the final step when the errand closed without reaching its goal. */
  unsuccessful?: boolean;
}

/** The errand the steps header follows: the newest one still in flight, else the newest overall. */
export function headerErrand(errands: readonly ErrandItem[]): ErrandItem | null {
  const newest = [...errands].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  return newest.find((errand) => !CLOSED_ERRAND_STATES.includes(errand.state)) ?? newest[0] ?? null;
}

/** Approval → Contacted → Your input → Done, positioned at the errand's current state. */
export function negotiationSteps(state: ErrandState): NegotiationStep[] {
  const closed = CLOSED_ERRAND_STATES.includes(state);
  const current = closed ? 3 : state === 'awaiting_principal' ? 2 : state === 'draft' || state === 'queued' ? 0 : 1;
  const labels = ['Approval', 'Contacted', 'Your input', closed ? ERRAND_STATUS[state] : 'Done'];
  return labels.map((label, index) => ({
    label,
    status: index < current || closed ? 'done' : index === current ? 'current' : 'upcoming',
    ...(closed && index === 3 && state !== 'resolved' ? { unsuccessful: true } : {}),
  }));
}

function timestamp(value: string): number {
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : 0;
}

function ordered(entries: ReadOnlyChatEntry[]): ReadOnlyChatEntry[] {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .sort((a, b) => a.at - b.at || Number(b.kind === 'task') - Number(a.kind === 'task') || a.id.localeCompare(b.id));
}

export function buildNegotiatorChat(conversations: readonly ErrandConversation[]): ReadOnlyChatEntry[] {
  const entries: ReadOnlyChatEntry[] = [];
  for (const { errand, messages, error } of conversations) {
    const details: NonNullable<ReadOnlyChatEntry['details']> = [];
    if (errand.pendingMessage && ['draft', 'queued', 'awaiting_principal'].includes(errand.state)) {
      details.push({
        label: errand.state === 'awaiting_principal' ? 'Question awaiting your answer' : 'Unsent draft',
        content: errand.pendingMessage,
      });
    }
    if (errand.delivery) {
      details.push({
        label: 'Delivery incomplete',
        content: `${errand.delivery.error ?? 'Message delivery pending.'} ${errand.delivery.sent}/${errand.delivery.total} contacts received the message.`,
      });
    }
    if (errand.notes) details.push({ label: 'Notes', content: errand.notes });
    if (errand.result) details.push({ label: 'Result', content: errand.result });
    if (error) details.push({ label: 'Conversation unavailable', content: error });
    entries.push({
      id: `errand:${errand.id}`,
      at: timestamp(errand.createdAt),
      kind: 'task',
      section: 'New errand',
      author: 'Errand',
      context: errand.id,
      content: errand.goal,
      status: ERRAND_STATUS[errand.state],
      error: Boolean(error) || errand.state === 'failed' || errand.state === 'expired',
      details,
    });
    const targets = new Map(errand.targets.map((target) => [target.sessionId, target]));
    for (const message of messages) {
      const target = targets.get(message.sessionId);
      const contact = target ? `${target.peerId} · ${target.channel}` : `Contact · ${message.sessionId}`;
      const assistant = message.role === 'assistant';
      const user = message.role === 'user';
      entries.push({
        id: `message:${message.sessionId}:${message.id}`,
        at: timestamp(message.createdAt),
        kind: assistant ? 'assistant' : user ? 'contact' : 'activity',
        author: assistant ? 'Negotiator' : user ? contact : `Recorded ${message.role} activity`,
        context: user ? errand.goal : `${errand.goal} · ${contact}`,
        content: message.content,
      });
    }
  }
  return ordered(entries);
}

const BEAT_TYPE: Record<string, string> = { reminder: 'Reminder', scheduled_beat: 'Scheduled task' };

/** One section per heartbeat run: the task that fired, then the Watcher's result (or failure). */
export function buildWatcherChat({ runs }: WatcherHistory): ReadOnlyChatEntry[] {
  return ordered(runs.flatMap((run) => {
    const failed = run.status === 'error';
    const details: NonNullable<ReadOnlyChatEntry['details']> = run.tools.length > 0
      ? [{ label: 'Tools used', content: run.tools.map((tool) => tool.status === 'error' ? `${tool.name} (failed)` : tool.name).join('\n') }]
      : [];
    const task: ReadOnlyChatEntry = {
      id: `run:${run.id}`,
      at: timestamp(run.startedAt),
      kind: 'task',
      section: 'Run',
      author: BEAT_TYPE[run.type] ?? 'Scheduled task',
      context: '',
      content: run.beat,
      status: failed ? 'Failed' : 'Completed',
      error: failed,
      details,
      detailsLabel: 'Run details',
    };
    const reply: ReadOnlyChatEntry = {
      id: `run:${run.id}:result`,
      at: Math.max(timestamp(run.finishedAt), task.at),
      kind: 'assistant',
      author: 'Watcher',
      context: run.beat,
      content: failed ? run.errorMessage || 'Run failed.' : run.result || 'No response recorded.',
      error: failed,
      ...(failed ? { status: 'Error' } : {}),
    };
    return [task, reply];
  }));
}

export async function loadNegotiatorChat(signal: AbortSignal, previous: ErrandConversation[] | null): Promise<ErrandConversation[]> {
  const { items } = await apiRequest<ErrandsResponse>('/errands?limit=50', { signal });
  const saved = new Map(previous?.map((conversation) => [conversation.errand.id, conversation.messages]));
  const conversations: ErrandConversation[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length && !signal.aborted) {
      const index = next++;
      const errand = items[index];
      try {
        const transcript = await apiRequest<ErrandTranscriptResponse>(`/errands/${encodeURIComponent(errand.id)}/transcript`, { signal });
        conversations[index] = { errand, messages: transcript.messages };
      } catch (error) {
        if (signal.aborted) throw error;
        conversations[index] = {
          errand,
          messages: saved.get(errand.id) ?? [],
          error: error instanceof Error ? error.message : 'Failed to load conversation',
        };
      }
    }
  }));
  signal.throwIfAborted();
  return conversations;
}

export async function loadWatcherChat(signal: AbortSignal): Promise<WatcherHistory> {
  const [beats, runs] = await Promise.all([
    apiRequest<HeartbeatsResponse>('/heartbeats', { signal }),
    apiRequest<BeatRunsResponse>('/heartbeats/runs?limit=20', { signal }),
  ]);
  return { beats: beats.items, runs: runs.items };
}
