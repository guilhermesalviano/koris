import type { AgentId } from './types';

export type AgentReadState = Partial<Record<AgentId, number>>;

const RENAMED_AGENTS: Record<string, AgentId> = { watcher: 'heartbeat' };

export function parseAgentReadState(value: string | null): AgentReadState {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const state: AgentReadState = {};
    for (const [key, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue;
      const id = RENAMED_AGENTS[key] ?? key;
      state[id] = Math.max(state[id] ?? 0, at);
    }
    return state;
  } catch {
    return {};
  }
}

export function latestActivity(times: number[]): number {
  return times.reduce((latest, at) => Number.isFinite(at) ? Math.max(latest, at) : latest, 0);
}

export function hasUnreadActivity(latest: number, readAt: number | undefined): boolean {
  return latest > (readAt ?? 0);
}
