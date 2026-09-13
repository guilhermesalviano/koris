import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReadOnlyAgentChat, ReadOnlyChatMessage } from './ReadOnlyAgentChat';
import type { ReadOnlyChatEntry } from '../../lib/subagent-chat';

const entry: ReadOnlyChatEntry = {
  id: 'm1', at: Date.parse('2026-09-13T10:00:00Z'), kind: 'assistant', author: 'Negotiator', context: 'Arrange lunch', content: 'Lunch confirmed.',
};

function renderState(patch: { loading?: boolean; loaded?: boolean; error?: string; entries?: ReadOnlyChatEntry[] } = {}) {
  return renderToStaticMarkup(<ReadOnlyAgentChat
    agentId="negotiator" title="Negotiator" entries={[entry]} loading={false} loaded error={null}
    onRefresh={() => {}} emptyText="No errands yet." historyLabel="Recent history" {...patch}
  />);
}

describe('read-only agent chat', () => {
  it('shows the transcript and refresh without messaging or mutation controls', () => {
    const html = renderState();
    expect(html).toContain('Lunch confirmed.');
    expect(html).toContain('Read-only');
    expect(html).toContain('Refresh');
    expect(html).not.toMatch(/<textarea|<input|<form|contenteditable/i);
    expect(html).not.toMatch(/>Send|>Approve|>Answer|>Cancel|>Close|>Resend|New session/);
    expect(html).toContain('role="separator"');
  });

  it('renders per-entry actions and drops the read-only label when they are provided', () => {
    const html = renderToStaticMarkup(<ReadOnlyAgentChat
      agentId="negotiator" title="Negotiator" entries={[entry]} loading={false} loaded error={null}
      onRefresh={() => {}} emptyText="No errands yet." historyLabel="Recent history"
      renderEntryActions={(item) => <button type="button">Act on {item.id}</button>}
    />);
    expect(html).toContain('Act on m1');
    expect(html).not.toContain('Read-only');
  });

  it('distinguishes loading and empty history', () => {
    const loading = renderState({ entries: [], loaded: false, loading: true });
    expect(loading).toContain('Loading conversation…');
    expect(loading).not.toContain('No errands yet.');
    const empty = renderState({ entries: [] });
    expect(empty).toContain('No errands yet.');
    expect(empty).not.toContain('Loading conversation…');
  });

  it('keeps loaded messages visible alongside refresh failures and retry', () => {
    const html = renderState({ error: 'Server unavailable' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Previously loaded history is still shown.');
    expect(html).toContain('Lunch confirmed.');
    expect(html).toContain('Retry');
  });

  it('escapes contact content and renders agent Markdown safely', () => {
    const contact = renderToStaticMarkup(<ReadOnlyChatMessage agentId="negotiator" entry={{ ...entry, kind: 'contact', content: '<script>alert(1)</script> **Hello**' }} />);
    expect(contact).not.toContain('<script>');
    expect(contact).toContain('**Hello**');
    expect(contact).toContain('flex-row-reverse');
    const assistant = renderToStaticMarkup(<ReadOnlyChatMessage agentId="negotiator" entry={{ ...entry, content: '**Hello** <script>alert(1)</script>' }} />);
    expect(assistant).toContain('<strong>Hello</strong>');
    expect(assistant).not.toContain('<script>');
  });
});
