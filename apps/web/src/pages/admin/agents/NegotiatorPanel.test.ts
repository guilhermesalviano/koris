import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { buildNegotiatorChat } from '../../../lib/subagent-chat';
import type { ErrandItem } from '../../../lib/types';
import { ErrandActions, NegotiationCenter, NegotiationStepsHeader, answerableErrands } from './NegotiatorPanel';

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
    expect([...html.matchAll(/<li[^>]*>/g)]).toHaveLength(3);
    expect(html).not.toContain('Your input');
    expect(html).toMatch(/<li aria-current="step"[^>]*>[\s\S]*?Contacted/);
  });
});

describe('negotiation center', () => {
  const center = (errands: ErrandItem[], entries = buildNegotiatorChat([])) => renderToStaticMarkup(createElement(NegotiationCenter, {
    entries, errands, loading: false, loaded: true, error: null, notify: () => {}, onAnswered: () => {},
  }));

  it('answers the newest pending question first and skips errands whose delivery is stuck', () => {
    const older = makeErrand({ id: 'a', state: 'awaiting_principal', lastProgressAt: '2026-09-13T10:01:00Z' });
    const newer = makeErrand({ id: 'b', state: 'awaiting_principal', lastProgressAt: '2026-09-13T10:02:00Z' });
    const stuck = makeErrand({ id: 'c', state: 'awaiting_principal', delivery: { type: 'resume', sent: 0, total: 1, error: 'offline' } });
    expect(answerableErrands([older, stuck, newer, makeErrand({ id: 'd', state: 'awaiting_peer' })]).map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('disables the composer when no question is waiting and explains the empty history', () => {
    const html = center([makeErrand({ state: 'awaiting_peer' })]);
    expect(html).toContain('No negotiation updates yet.');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*placeholder="No question is waiting for your answer"/);
    expect(html).not.toContain('<select');
  });

  it('shows the pending question in the composer, with a picker when several are waiting', () => {
    const one = center([makeErrand({ state: 'awaiting_principal', pendingMessage: 'Would 11 work?' })]);
    expect(one).toContain('placeholder="Answer: Would 11 work?"');
    expect(one).not.toContain('<select');
    const several = center([
      makeErrand({ id: 'a', goal: 'Lunch', state: 'awaiting_principal' }),
      makeErrand({ id: 'b', goal: 'Haircut', state: 'awaiting_principal' }),
    ]);
    expect(several).toContain('aria-label="Question to answer"');
    expect(several).toContain('>Lunch</option>');
    expect(several).toContain('>Haircut</option>');
  });
});
