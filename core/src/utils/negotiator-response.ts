export type NegotiatorAction = 'continue' | 'escalate' | 'resolved' | 'failed';

export interface NegotiatorVerdict {
  action: NegotiatorAction;
  reply: string;
  notes?: string;
  detail?: string;
}

const NEGOTIATOR_ACTIONS = new Set<NegotiatorAction>(['continue', 'escalate', 'resolved', 'failed']);

function isNegotiatorAction(value: string): value is NegotiatorAction {
  return NEGOTIATOR_ACTIONS.has(value as NegotiatorAction);
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// A negotiator response that fails to parse is treated as a plain reply that
// keeps the negotiation going, rather than silently dropped — the LLM still
// said *something* useful to the peer even if it missed the JSON contract.
export function parseNegotiatorResponse(text: string): NegotiatorVerdict {
  const parsed = tryParseJson(text);

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const action = typeof record.action === 'string' && isNegotiatorAction(record.action) ? record.action : 'continue';
    const reply = typeof record.reply === 'string' ? record.reply.trim() : '';
    const notes = typeof record.notes === 'string' ? record.notes.trim() : undefined;
    const detail = typeof record.detail === 'string' ? record.detail.trim() : undefined;
    return { action, reply, notes, detail };
  }

  return { action: 'continue', reply: text.trim() };
}
