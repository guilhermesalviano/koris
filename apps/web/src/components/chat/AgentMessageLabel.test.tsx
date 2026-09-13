import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AgentMessageLabel } from './AgentMessageLabel';

describe('agent message attribution', () => {
  it('identifies the sender and recipient and links to the subagent chat', () => {
    const html = renderToStaticMarkup(<MemoryRouter><AgentMessageLabel senderAgentId="negotiator" /></MemoryRouter>);
    expect(html).toContain('Message from Negotiator to Orchestrator');
    expect(html).toContain('href="/admin/agents/negotiator"');
    expect(html).toContain('→');
    expect(html).not.toContain('<button');
  });
});
