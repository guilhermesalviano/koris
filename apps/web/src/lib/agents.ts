import type { AgentId, AgentSummary } from './types';

export interface AgentNode {
  agent: AgentSummary;
  children: AgentNode[];
}

export const ORCHESTRATOR_ID: AgentId = 'orchestrator';

export function agentPath(id: AgentId): string {
  return `/admin/agents/${id}`;
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
