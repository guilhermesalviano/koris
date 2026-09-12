import { describe, it, expect } from 'vitest';
import { parseNegotiatorResponse } from '../../../src/utils/negotiator-response';

describe('parseNegotiatorResponse', () => {
  it('parses a well-formed JSON verdict', () => {
    const verdict = parseNegotiatorResponse(JSON.stringify({
      action: 'continue',
      reply: 'Sure, what time works?',
      notes: 'they are interested',
    }));

    expect(verdict).toEqual({
      action: 'continue',
      reply: 'Sure, what time works?',
      notes: 'they are interested',
      detail: undefined,
    });
  });

  it('unwraps a fenced JSON code block', () => {
    const verdict = parseNegotiatorResponse('```json\n{"action":"resolved","reply":"Great, see you then!","detail":"scheduled for 3pm"}\n```');

    expect(verdict.action).toBe('resolved');
    expect(verdict.detail).toBe('scheduled for 3pm');
  });

  it('defaults to "continue" for an unrecognised action', () => {
    const verdict = parseNegotiatorResponse(JSON.stringify({ action: 'bogus', reply: 'hi' }));
    expect(verdict.action).toBe('continue');
  });

  it('treats unparsable text as a plain "continue" reply rather than dropping it', () => {
    const verdict = parseNegotiatorResponse('Sure, I can do that for you.');
    expect(verdict).toEqual({ action: 'continue', reply: 'Sure, I can do that for you.' });
  });

  it('defaults reply to an empty string when absent from valid JSON', () => {
    const verdict = parseNegotiatorResponse(JSON.stringify({ action: 'escalate', detail: 'need your ok' }));
    expect(verdict.reply).toBe('');
    expect(verdict.detail).toBe('need your ok');
  });
});
