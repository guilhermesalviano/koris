const LID_SUFFIX = 'lid';

export function parseMentionTarget(jid: string): string {
  const trimmed = jid.trim();
  if (!trimmed.startsWith('@')) return trimmed;

  const number = trimmed.slice(1);
  if (!/^\d+$/.test(number)) return trimmed;

  return `${number}@${LID_SUFFIX}`;
}
