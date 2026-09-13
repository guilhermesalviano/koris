import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { buildNegotiationCenter, buildNegotiatorChat } from '../../../lib/subagent-chat';
import type { ErrandItem, NegotiatorPendingQuestion } from '../../../lib/types';
import { ErrandActions, NegotiationCenter, NegotiationStepsHeader } from './NegotiatorPanel';

function makeErrand(patch: Partial<ErrandItem>): ErrandItem {
  return {
    id: 'errand-1', goal: 'Book an appointment', state: 'draft', originSessionId: 'origin',
    pendingMessage: null, delivery: null, notes: null, result: null,
    createdAt: '2026-09-13T10:00:00Z', lastProgressAt: null, closedAt: null, targets: [], ...patch,
  };
}

function renderErrand(patch: Partial<ErrandItem>, initialAnswering = false): string {
  const errand = makeErrand(patch);
  return renderToStaticMarkup(createElement(ReadOnlyChatMessage, {
    entry: buildNegotiatorChat([{ errand, messages: [] }])[0],
    agentId: 'negotiator',
    actions: createElement(ErrandActions, { errand, onChanged: () => {}, notify: () => {}, initialAnswering }),
  }));
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/button>/g)].map((match) => match[1]);
}

describe('errand information and actions', () => {
  it('offers approval of an unsent draft alongside close and cancel', () => {
    const html = renderErrand({ pendingMessage: 'Could you book Saturday at 10?' });
    expect(html).toContain('Unsent draft');
    expect(html).toContain('Could you book Saturday at 10?');
    expect(html).toContain('Current status:');
    expect(buttons(html)).toEqual(['Approve', 'Close', 'Cancel']);
    expect(html).not.toContain('<details open');
  });

  it('offers an answer to unanswered questions and opens the answer form', () => {
    const html = renderErrand({ state: 'awaiting_principal', pendingMessage: 'Would 11 or 14 work?' });
    expect(html).toContain('Question awaiting your answer');
    expect(html).toContain('Would 11 or 14 work?');
    expect(buttons(html)).toEqual(['Answer', 'Close', 'Cancel']);
    expect(html).not.toContain('<input');

    const answering = renderErrand({ state: 'awaiting_principal', pendingMessage: 'Would 11 or 14 work?' }, true);
    expect(answering).toContain('aria-label="Answer to send to the contact"');
    expect(buttons(answering)).toEqual(['Close Reply', 'Close', 'Cancel', 'Send Answer']);
  });

  it('offers to retry an incomplete delivery instead of approving or answering', () => {
    const html = renderErrand({ state: 'awaiting_principal', pendingMessage: 'Hello', delivery: { type: 'opener', sent: 1, total: 2, error: 'Channel offline' } });
    expect(html).toContain('Channel offline');
    expect(html).toContain('1/2 contacts received the message');
    expect(html).toContain('Delivery incomplete');
    expect(buttons(html)).toEqual(['Retry Send', 'Close', 'Cancel']);
  });

  it('offers no actions once an errand is closed', () => {
    const html = renderErrand({ state: 'resolved', result: 'Booked for Saturday' });
    expect(html).toContain('Booked for Saturday');
    expect(html).not.toContain('<button');
  });
});

describe('negotiation steps header', () => {
  it('shows the goal and marks the current step in a single row', () => {
    const html = renderToStaticMarkup(createElement(NegotiationStepsHeader, { errand: { goal: 'Pedir um lanche', state: 'awaiting_principal' } }));
    expect(html).toContain('Pedir um lanche');
    expect(html).toContain('aria-label="Negotiation steps"');
    expect([...html.matchAll(/<li[^>]*>/g)]).toHaveLength(4);
    expect(html).not.toContain('Your input');
    expect(html).toMatch(/<li aria-current="step"[^>]*>[\s\S]*?Contacted/);
  });
});

describe('negotiation center', () => {
  const question = (patch: Partial<NegotiatorPendingQuestion> = {}): NegotiatorPendingQuestion => ({
    errandId: 'errand-1', goal: 'Book an appointment', kind: 'question', question: 'Would 11 work?', askedAt: '2026-09-13T10:02:00Z', ...patch,
  });
  const center = (pending: NegotiatorPendingQuestion[]) => renderToStaticMarkup(createElement(NegotiationCenter, {
    entries: [], pending, loading: false, loaded: true, error: null, notify: () => {}, onAnswered: () => {},
  }));

  it('opens each errand with its own "New errand" divider', () => {
    const entries = buildNegotiationCenter([
      { id: 'n1', role: 'assistant', content: 'Question about lunch', createdAt: '2026-09-13T10:04:00Z', errandId: 'a' },
      { id: 'n2', role: 'user', content: 'Noon', createdAt: '2026-09-13T10:05:00Z', errandId: 'a' },
      { id: 'n3', role: 'assistant', content: 'Question about the haircut', createdAt: '2026-09-13T10:06:00Z', errandId: 'b' },
    ], [makeErrand({ id: 'a', goal: 'Lunch' }), makeErrand({ id: 'b', goal: 'Haircut' })]);
    const html = renderToStaticMarkup(createElement(NegotiationCenter, {
      entries, pending: [], loading: false, loaded: true, error: null, notify: () => {}, onAnswered: () => {},
    }));
    const separators = [...html.matchAll(/role="separator" aria-label="([^"]*)"/g)].map((match) => match[1]);
    expect(separators).toHaveLength(2);
    expect(separators.every((label) => label.startsWith('New errand · '))).toBe(true);
  });

  it('disables the composer when no question is waiting and explains the empty history', () => {
    const html = center([]);
    expect(html).toContain('No negotiation updates yet.');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*placeholder="No question is waiting for your answer"/);
    expect(html).not.toContain('<select');
  });

  it('offers Resolve and asks for extra requirements when the target is a proposed result', () => {
    const html = center([question({ kind: 'confirmation', question: 'Booked Saturday at 11' })]);
    expect(buttons(html)).toContain('Resolve');
    expect(html).toContain('placeholder="Add a requirement…"');
    expect(buttons(center([question()]))).not.toContain('Resolve');
  });

  it('enables the composer from the pending questions, with a picker when several are waiting', () => {
    const one = center([question()]);
    expect(one).toContain('placeholder="Answer: Would 11 work?"');
    expect(one).not.toMatch(/<input[^>]*disabled=""/);
    expect(one).not.toContain('<select');
    const several = center([question({ errandId: 'b', goal: 'Haircut' }), question({ errandId: 'a', goal: 'Lunch' })]);
    expect(several).toContain('aria-label="Question to answer"');
    expect(several.indexOf('>Haircut</option>')).toBeLessThan(several.indexOf('>Lunch</option>'));
    expect(several).toContain('placeholder="Answer: Would 11 work?"');
  });
});

describe('errand actions for a proposed result', () => {
  it('offers Resolve and relabels Answer as Add requirement', () => {
    const html = renderErrand({ state: 'awaiting_confirmation', pendingMessage: 'Booked Saturday at 11' });
    expect(buttons(html)).toEqual(expect.arrayContaining(['Resolve', 'Add requirement', 'Close', 'Cancel']));
    expect(buttons(html)).not.toContain('Answer');
    expect(html).toContain('Result awaiting your confirmation');
    const answering = renderErrand({ state: 'awaiting_confirmation', pendingMessage: 'Booked Saturday at 11' }, true);
    expect(answering).toContain('placeholder="e.g. Also ask for a juice…"');
  });
});
