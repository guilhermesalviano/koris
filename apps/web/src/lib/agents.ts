import type { AgentId, AgentSummary } from './types';

export interface AgentNode {
  agent: AgentSummary;
  children: AgentNode[];
}

export const ORCHESTRATOR_ID: AgentId = 'orchestrator';

export function agentPath(id: AgentId): string {
  return `/admin/agents/${id}`;
}

/** The roster's display name for an agent, or its id in title case while the roster is unavailable. */
export function agentName(id: AgentId, roster: readonly AgentSummary[]): string {
  return roster.find((agent) => agent.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Portrait served from `apps/web/public/agents/`. */
export function agentAvatarUrl(id: AgentId): string {
  return `/agents/${id}.jpg`;
}

/**
 * Nests the flat roster by `parentId`, keeping the server's order. An agent
 * whose parent is missing from the list is promoted to the top level rather
 * than dropped.
 */
export function buildAgentTree(items: readonly AgentSummary[]): AgentNode[] {
  const nodes = new Map<AgentId, AgentNode>(items.map((agent) => [agent.id, { agent, children: [] }]));
  const roots: AgentNode[] = [];
  for (const agent of items) {
    const node = nodes.get(agent.id)!;
    const parent = agent.parentId ? nodes.get(agent.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
