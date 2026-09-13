import type { AgentId } from './types';

interface AgentMessage {
  role: string;
  content: string;
  senderAgentId?: AgentId;
}

export function agentMessagePresentation(message: AgentMessage): Pick<AgentMessage, 'content' | 'senderAgentId'> {
  const original = { content: message.content, senderAgentId: message.senderAgentId };
  if (message.role !== 'assistant') return { content: message.content };
  if (message.senderAgentId && message.senderAgentId !== 'negotiator') return original;

  const question = /^❓ Errand "([\s\S]+?)" needs your input: ([\s\S]+)$/.exec(message.content);
  if (question) {
    return { senderAgentId: 'negotiator', content: `I need your input on “${question[1]}”.\n\n${question[2]}` };
  }
  const resolved = /^✅ Errand "([\s\S]+?)" resolved: ([\s\S]+)$/.exec(message.content);
  if (resolved) {
    return { senderAgentId: 'negotiator', content: `I've completed “${resolved[1]}”.\n\n${resolved[2]}` };
  }
  const failed = /^⚠️? Errand "([\s\S]+?)" failed: ([\s\S]+)$/.exec(message.content);
  if (failed) {
    return { senderAgentId: 'negotiator', content: `I couldn't complete “${failed[1]}”.\n\n${failed[2]}` };
  }
  return original;
}
