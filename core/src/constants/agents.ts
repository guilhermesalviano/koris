export type AgentId = string;

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  description: string;
  /** Parent agent in the roster tree; `null` for top-level agents. */
  parentId: AgentId | null;
  /** Whether the principal can message this agent directly from the web chat. */
  messageable: boolean;
}

export const ORCHESTRATOR: AgentDescriptor = {
  id: 'orchestrator',
  name: 'Orchestrator',
  description: 'Main agent. Talks with you and delegates work to the sub-agents.',
  parentId: null,
  messageable: true,
};

export function buildAgentRoster(subAgents: ReadonlyArray<AgentDescriptor & { listed: boolean }>): AgentDescriptor[] {
  return [
    ORCHESTRATOR,
    ...subAgents
      .filter((agent) => agent.listed)
      .map(({ id, name, description, parentId, messageable }) => ({ id, name, description, parentId, messageable })),
  ];
}
