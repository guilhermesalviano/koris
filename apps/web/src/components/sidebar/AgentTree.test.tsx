import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AgentTree } from './AgentTree';
import { buildAgentTree } from '../../lib/agents';
import type { AgentSummary } from '../../lib/types';

const ROSTER: AgentSummary[] = [
  { id: 'orchestrator', name: 'Orchestrator', description: 'Main', parentId: null, messageable: true },
  { id: 'negotiator', name: 'Negotiator', description: '', parentId: 'orchestrator', messageable: false },
  { id: 'watcher', name: 'Watcher (Heartbeat)', description: '', parentId: 'orchestrator', messageable: false },
];

function render(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AgentTree nodes={buildAgentTree(ROSTER)} />
    </MemoryRouter>,
  );
}

describe('AgentTree', () => {
  it('renders every agent with a link to its page, sub-agents nested in a child list', () => {
    const html = render('/admin/agents/orchestrator');

    for (const agent of ROSTER) {
      expect(html).toContain(agent.name);
      expect(html).toContain(`href="/admin/agents/${agent.id}"`);
    }
    // The orchestrator row's <li> contains the nested <ul> with its sub-agents.
    expect(html.match(/<ul/g)).toHaveLength(2);
  });

  it('marks only sub-agents as read-only', () => {
    const html = render('/admin/agents/orchestrator');

    expect(html.match(/aria-label="Read-only"/g)).toHaveLength(2);
  });

  it('highlights the agent matching the current route', () => {
    const html = render('/admin/agents/watcher');

    const active = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/admin/agents/watcher"');
  });
});
