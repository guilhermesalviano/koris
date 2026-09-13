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

  it('opens each errand with its own separator instead of a plain time divider', () => {
    const task: ReadOnlyChatEntry = { ...entry, id: 'errand:e1', kind: 'task', section: 'New errand', author: 'Errand', content: 'Arrange lunch' };
    const reply: ReadOnlyChatEntry = { ...entry, id: 'm2', at: entry.at + 60_000 };
    const html = renderState({ entries: [task, reply] });
    const separators = [...html.matchAll(/role="separator" aria-label="([^"]*)"/g)].map((match) => match[1]);
    expect(separators).toHaveLength(1);
    expect(separators[0]).toMatch(/^New errand · /);
    expect(html).toContain('border-accent-muted');
  });

  it('moves the history into a right aside and leaves the main area blank when asked', () => {
    const inline = renderState();
    expect(inline).not.toContain('<aside');

    const html = renderToStaticMarkup(<ReadOnlyAgentChat
      agentId="negotiator" title="Negotiator" entries={[entry]} loading={false} loaded error={null}
      onRefresh={() => {}} emptyText="No errands yet." historyLabel="Recent history" historyAside
    />);
    const main = /<section aria-label="Negotiator main"[^>]*><\/section>/.exec(html);
    expect(main).not.toBeNull();
    const aside = html.slice(html.indexOf('<aside aria-label="Negotiator history"'));
    expect(aside).toContain('Lunch confirmed.');
    expect(aside).toContain('Recent history');

    const withMain = renderToStaticMarkup(<ReadOnlyAgentChat
      agentId="negotiator" title="Negotiator" entries={[entry]} loading={false} loaded error={null}
      onRefresh={() => {}} emptyText="No errands yet." historyLabel="Recent history" historyAside main={<p>Center content</p>}
    />);
    expect(withMain).toMatch(/<section aria-label="Negotiator main"[^>]*><p>Center content<\/p><\/section>/);
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

  it('shows an entry\'s images as thumbnails that open the preview, with placeholders for deleted ones', () => {
    const image = { data: 'bWVudQ==', mimeType: 'image/jpeg' };
    const contact: ReadOnlyChatEntry = { ...entry, kind: 'contact', content: '', images: [image], missingImages: 1 };
    const clickable = renderToStaticMarkup(<ReadOnlyChatMessage agentId="negotiator" entry={contact} onPreviewImages={() => {}} />);
    expect(clickable).toContain('src="data:image/jpeg;base64,bWVudQ=="');
    expect(clickable).toContain('aria-label="View image 1"');
    expect(clickable).toContain('This image was deleted');
    expect(clickable).not.toContain('whitespace-pre-wrap');
    const plain = renderToStaticMarkup(<ReadOnlyChatMessage agentId="negotiator" entry={contact} />);
    expect(plain).toContain('src="data:image/jpeg;base64,bWVudQ=="');
    expect(plain).not.toContain('<button');
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
