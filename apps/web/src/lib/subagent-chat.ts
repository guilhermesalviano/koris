import { apiRequest } from './api';
import { agentMessagePresentation } from './agent-message';
import type { BeatRunItem, BeatRunsResponse, ErrandItem, ErrandState, ErrandsResponse, ErrandTranscriptMessage, ErrandTranscriptResponse, HeartbeatItem, ImageAttachment, HeartbeatsResponse, NegotiatorNotice, NegotiatorNoticesResponse, NegotiatorPendingQuestion } from './types';

export interface ReadOnlyChatEntry {
  id: string;
  at: number;
  kind: 'assistant' | 'contact' | 'task' | 'activity';
  author: string;
  context: string;
  content: string;
  images?: ImageAttachment[];
  /** Images this message carried that have since been deleted. */
  missingImages?: number;
  error?: boolean;
  status?: string;
  details?: { label: string; content: string }[];
  /** Title of the collapsed details on this entry; task entries default to the errand wording. */
  detailsLabel?: string;
  /** Opens a new chat section (e.g. "New errand"), shown with the entry's time in an accented divider. */
  section?: string;
  /** Time shown in the section divider when it differs from the entry's own (e.g. when the errand started). */
  sectionAt?: number;
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
  awaiting_confirmation: 'Waiting for your confirmation',
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

/** Approval → Contacted → Confirm → Done, positioned at the errand's current state; a question for the human stays on Contacted. */
export function negotiationSteps(state: ErrandState): NegotiationStep[] {
  const closed = CLOSED_ERRAND_STATES.includes(state);
  const current = closed ? 3 : state === 'awaiting_confirmation' ? 2 : state === 'draft' || state === 'queued' ? 0 : 1;
  const labels = ['Approval', 'Contacted', 'Confirm', closed ? ERRAND_STATUS[state] : 'Done'];
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
    if (errand.pendingMessage && ['draft', 'queued', 'awaiting_principal', 'awaiting_confirmation'].includes(errand.state)) {
      details.push({
        label: errand.state === 'awaiting_principal' ? 'Question awaiting your answer'
          : errand.state === 'awaiting_confirmation' ? 'Result awaiting your confirmation' : 'Unsent draft',
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
        ...(message.images?.length ? { images: message.images } : {}),
        ...(message.missingImages ? { missingImages: message.missingImages } : {}),
      });
    }
  }
  return ordered(entries);
}

/**
 * The negotiation center: every negotiation session's messages as one history —
 * the Negotiator's notices on the left, the principal's answers on the right,
 * each labelled with the errand it belongs to.
 */
export function buildNegotiationCenter(notices: readonly NegotiatorNotice[], errands: readonly ErrandItem[]): ReadOnlyChatEntry[] {
  const known = new Map(errands.map((errand) => [errand.id, errand]));
  const errandOf = new Map(notices.map((notice) => [`notice:${notice.id}`, notice.errandId]));
  const entries = ordered(notices.map((notice) => {
    const answer = notice.role === 'user';
    const { content } = agentMessagePresentation({ role: notice.role, content: notice.content, senderAgentId: notice.senderAgentId });
    return {
      id: `notice:${notice.id}`,
      at: timestamp(notice.createdAt),
      kind: answer ? 'contact' : 'assistant',
      author: answer ? 'You' : 'Negotiator',
      context: (notice.errandId && known.get(notice.errandId)?.goal) ?? notice.errandId ?? '',
      content,
    };
  }));
  // Each errand opens its own section at its first message, dated when the errand started.
  const seen = new Set<string>();
  return entries.map((entry) => {
    const errandId = errandOf.get(entry.id);
    if (!errandId || seen.has(errandId)) return entry;
    seen.add(errandId);
    const errand = known.get(errandId);
    return { ...entry, section: 'New errand', ...(errand ? { sectionAt: timestamp(errand.createdAt) } : {}) };
  });
}

export interface NegotiationCenterData {
  notices: NegotiatorNotice[];
  /** Questions waiting on the principal, newest first — from the same response as the notices. */
  pending: NegotiatorPendingQuestion[];
  /** Fingerprint of the errand list; a change means the errands should be reloaded. */
  errandsVersion: string;
}

export async function loadNegotiatorNotices(signal: AbortSignal): Promise<NegotiationCenterData> {
  const { messages, pending, errandsVersion } = await apiRequest<NegotiatorNoticesResponse>('/agents/negotiator/notices?limit=200', { signal });
  return { notices: messages, pending: [...pending].sort((a, b) => timestamp(b.askedAt) - timestamp(a.askedAt)), errandsVersion };
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

/** Changes whenever an errand's transcript may have: its state, progress, or any contact session's message count. */
function transcriptVersion(errand: ErrandItem): string {
  return JSON.stringify([errand.state, errand.lastProgressAt, errand.targets.map((target) => [target.sessionId, target.messageCount])]);
}

export async function loadNegotiatorChat(signal: AbortSignal, previous: ErrandConversation[] | null): Promise<ErrandConversation[]> {
  const { items } = await apiRequest<ErrandsResponse>('/errands?limit=50', { signal });
  const saved = new Map(previous?.map((conversation) => [conversation.errand.id, conversation]));
  const conversations: ErrandConversation[] = new Array(items.length);
  // Unchanged transcripts are reused, so a steady refresh costs one request.
  const stale: number[] = [];
  items.forEach((errand, index) => {
    const known = saved.get(errand.id);
    if (known && !known.error && transcriptVersion(known.errand) === transcriptVersion(errand)) {
      conversations[index] = { errand, messages: known.messages };
    } else {
      stale.push(index);
    }
  });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, stale.length) }, async () => {
    while (next < stale.length && !signal.aborted) {
      const index = stale[next++];
      const errand = items[index];
      try {
        const transcript = await apiRequest<ErrandTranscriptResponse>(`/errands/${encodeURIComponent(errand.id)}/transcript`, { signal });
        conversations[index] = { errand, messages: transcript.messages };
      } catch (error) {
        if (signal.aborted) throw error;
        conversations[index] = {
          errand,
          messages: saved.get(errand.id)?.messages ?? [],
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
