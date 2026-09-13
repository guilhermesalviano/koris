import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { buildNegotiatorChat } from '../../../lib/subagent-chat';
import type { ErrandItem } from '../../../lib/types';

function renderErrand(patch: Partial<ErrandItem>): string {
  const errand: ErrandItem = {
    id: 'errand-1', goal: 'Book an appointment', state: 'draft', originSessionId: 'origin',
    pendingMessage: null, delivery: null, notes: null, result: null,
    createdAt: '2026-09-13T10:00:00Z', lastProgressAt: null, closedAt: null, targets: [], ...patch,
  };
  return renderToStaticMarkup(createElement(ReadOnlyChatMessage, {
    entry: buildNegotiatorChat([{ errand, messages: [] }])[0], agentId: 'negotiator',
  }));
}

describe('read-only errand information', () => {
  it('identifies an unsent draft without offering approval', () => {
    const html = renderErrand({ pendingMessage: 'Could you book Saturday at 10?' });
    expect(html).toContain('Unsent draft');
    expect(html).toContain('Could you book Saturday at 10?');
    expect(html).toContain('Current status:');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<details open');
  });

  it('shows unanswered questions without an answer input', () => {
    const html = renderErrand({ state: 'awaiting_principal', pendingMessage: 'Would 11 or 14 work?' });
    expect(html).toContain('Question awaiting your answer');
    expect(html).toContain('Would 11 or 14 work?');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
  });

  it('explains partial delivery without offering to send anything', () => {
    const html = renderErrand({ pendingMessage: 'Hello', delivery: { type: 'opener', sent: 1, total: 2, error: 'Channel offline' } });
    expect(html).toContain('Channel offline');
    expect(html).toContain('1/2 contacts received the message');
    expect(html).toContain('Delivery incomplete');
    expect(html).not.toContain('Retry');
  });
});
