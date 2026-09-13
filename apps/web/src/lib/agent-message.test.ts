import { describe, expect, it } from 'vitest';
import { agentMessagePresentation } from './agent-message';
import { mapMessages, mergeMessages, nextId, type ChatMessage } from './chat-history';

describe('errand messages to the Orchestrator', () => {
  it.each([
    '❓ Errand "Book lunch" needs your input: Would noon work?',
    '❓ Errand "Book lunch" needs your input: Would noon work?\n\nReply with: `/errand reply e1 <your answer>`',
  ])('presents an escalation as a plain Negotiator question, dropping the legacy reply command: %s', (content) => {
    expect(agentMessagePresentation({ role: 'assistant', content })).toEqual({
      senderAgentId: 'negotiator',
      content: 'I need your input on “Book lunch”.\n\nWould noon work?',
    });
  });

  it.each([
    ['✅ Errand "Book lunch" resolved: A table for two.\nAt noon.', "I've completed “Book lunch”.\n\nA table for two.\nAt noon."],
    ['⚠️ Errand "Book lunch" failed: No tables left.', "I couldn't complete “Book lunch”.\n\nNo tables left."],
    ['📤 Errand "Book lunch" started. Sent to contact: "Hi! A table for two?"', "I've started “Book lunch”. I sent the contact:\n\nHi! A table for two?"],
    ['📤 Errand "Book lunch" resumed. Sent to contact: "Noon works."', "I've resumed “Book lunch”. I sent the contact:\n\nNoon works."],
  ])('presents the recorded outcome as a message: %s', (content, expected) => {
    expect(agentMessagePresentation({ role: 'assistant', content, senderAgentId: 'negotiator' })).toEqual({ senderAgentId: 'negotiator', content: expected });
  });

  it('does not attribute user quotes or ordinary Orchestrator messages to the Negotiator', () => {
    const content = '✅ Errand "Book lunch" resolved: Done.';
    expect(agentMessagePresentation({ role: 'user', content })).toEqual({ content });
    expect(agentMessagePresentation({ role: 'assistant', content, senderAgentId: 'orchestrator' })).toEqual({ content, senderAgentId: 'orchestrator' });
    expect(agentMessagePresentation({ role: 'assistant', content: `An example: ${content}` })).toEqual({ content: `An example: ${content}` });
  });

  it('preserves explicit attribution even without legacy alert formatting', () => {
    expect(agentMessagePresentation({ role: 'assistant', senderAgentId: 'negotiator', content: 'The contact confirmed noon.' }))
      .toEqual({ senderAgentId: 'negotiator', content: 'The contact confirmed noon.' });
  });

  it('keeps a subagent message separate from a matching optimistic Orchestrator reply', () => {
    const local: ChatMessage = { id: nextId(), role: 'assistant', content: 'Booked.', timestamp: '10:00', at: 1000 };
    const notice = { id: 'notice', role: 'assistant', senderAgentId: 'negotiator' as const, content: 'Booked.', createdAt: new Date(2000).toISOString() };
    const merged = mergeMessages([local], [notice]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(local);
    expect(merged[1]).toMatchObject({ serverId: 'notice', senderAgentId: 'negotiator' });
    expect(mergeMessages(merged, [notice])).toBe(merged);
    expect(mapMessages([notice])[0].senderAgentId).toBe('negotiator');
  });
});
