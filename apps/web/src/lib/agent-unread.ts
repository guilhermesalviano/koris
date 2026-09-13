import type { AgentId } from './types';

export type AgentReadState = Partial<Record<AgentId, number>>;

export function parseAgentReadState(value: string | null): AgentReadState {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const state: AgentReadState = {};
    for (const id of ['orchestrator', 'negotiator', 'watcher'] as const) {
      const at = (parsed as Record<string, unknown>)[id];
      if (typeof at === 'number' && Number.isFinite(at) && at >= 0) state[id] = at;
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
