import { describe, expect, it } from 'vitest';
import { agentPath, buildAgentTree } from './agents';
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
      agent('watcher', 'orchestrator'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].agent.id).toBe('orchestrator');
    expect(tree[0].children.map((c) => c.agent.id)).toEqual(['negotiator', 'watcher']);
  });

  it('keeps children listed before their parent', () => {
    const tree = buildAgentTree([agent('watcher', 'orchestrator'), agent('orchestrator', null)]);

    expect(tree.map((n) => n.agent.id)).toEqual(['orchestrator']);
    expect(tree[0].children.map((c) => c.agent.id)).toEqual(['watcher']);
  });

  it('promotes an agent whose parent is missing to the top level', () => {
    const tree = buildAgentTree([agent('negotiator', 'orchestrator')]);

    expect(tree.map((n) => n.agent.id)).toEqual(['negotiator']);
  });
});

describe('agentPath', () => {
  it('builds the admin route for an agent', () => {
    expect(agentPath('watcher')).toBe('/admin/agents/watcher');
  });
});
