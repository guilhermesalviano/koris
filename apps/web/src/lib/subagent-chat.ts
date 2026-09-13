import { apiRequest } from './api';
import type { AuditItem, AuditResponse, ErrandItem, ErrandState, ErrandsResponse, ErrandTranscriptMessage, ErrandTranscriptResponse, HeartbeatItem, HeartbeatsResponse } from './types';

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
}

export interface ErrandConversation {
  errand: ErrandItem;
  messages: ErrandTranscriptMessage[];
  error?: string;
}

export interface WatcherHistory {
  beats: HeartbeatItem[];
  runs: AuditItem[];
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

export function buildWatcherChat({ beats, runs }: WatcherHistory): ReadOnlyChatEntry[] {
  const beatsById = new Map(beats.map((beat) => [beat.id, beat]));
  return ordered(runs.map((run) => {
    const beat = run.runId ? beatsById.get(run.runId) : undefined;
    const failed = run.status === 'error';
    const activity = run.type === 'tool' || (run.toolCalls ?? 0) > 0;
    const response = run.response || run.responsePreview || 'No response recorded.';
    return {
      id: `audit:${run.id}`,
      at: timestamp(run.createdAt),
      kind: activity ? 'activity' : 'assistant',
      author: 'Watcher',
      context: beat?.beat ?? (run.runId ? `Scheduled task · ${run.runId}` : 'Scheduled task'),
      content: failed ? run.errorMessage || run.errorCode || 'Run failed.' : activity ? run.toolName ? `Tool activity · ${run.toolName}` : 'Tool activity' : response,
      error: failed,
      status: failed ? 'Error' : activity ? 'Recorded activity' : 'Recorded response',
      details: activity ? [{ label: 'Recorded tool activity', content: response }] : undefined,
    };
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
    apiRequest<AuditResponse>('/audit?agentName=heartbeat&limit=20', { signal }),
  ]);
  return { beats: beats.items, runs: runs.items };
}
