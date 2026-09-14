import { describe, expect, it } from 'vitest';
import { agentAvatarUrl, agentName, agentPath, buildAgentTree } from './agents';
import type { AgentSummary } from './types';

const agent = (id: AgentSummary['id'], parentId: AgentSummary['parentId']): AgentSummary => ({
  id,
  name: id,
  description: '',
  parentId,
  messageable: parentId === null,
});

describe('buildAgentTree', () => {
  it('nests sub-agents under their parent in server order', () => {
    const tree = buildAgentTree([
      agent('orchestrator', null),
      agent('negotiator', 'orchestrator'),
      agent('heartbeat', 'orchestrator'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].agent.id).toBe('orchestrator');
    expect(tree[0].children.map((c) => c.agent.id)).toEqual(['negotiator', 'heartbeat']);
  });

  it('keeps children listed before their parent', () => {
    const tree = buildAgentTree([agent('heartbeat', 'orchestrator'), agent('orchestrator', null)]);

    expect(tree.map((n) => n.agent.id)).toEqual(['orchestrator']);
    expect(tree[0].children.map((c) => c.agent.id)).toEqual(['heartbeat']);
  });

  it('promotes an agent whose parent is missing to the top level', () => {
    const tree = buildAgentTree([agent('negotiator', 'orchestrator')]);

    expect(tree.map((n) => n.agent.id)).toEqual(['negotiator']);
  });
});

describe('agentPath', () => {
  it('builds the admin route for an agent', () => {
    expect(agentPath('heartbeat')).toBe('/admin/agents/heartbeat');
  });

  it('points at the agent portrait in the public folder', () => {
    expect(agentAvatarUrl('negotiator')).toBe('/agents/negotiator.jpg');
  });
});

describe('agentName', () => {
  it('uses the roster name and falls back to the id in title case', () => {
    expect(agentName('heartbeat', [{ ...agent('heartbeat', 'orchestrator'), name: 'Watcher (Heartbeat)' }])).toBe('Watcher (Heartbeat)');
    expect(agentName('scout', [])).toBe('Scout');
  });
});
