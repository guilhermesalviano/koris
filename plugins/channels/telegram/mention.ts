export function isBotMentioned(
  text: string,
  entities: Array<{ type: string; offset: number; length: number }>,
  username: string | null,
): boolean {
  if (!username) return false;
  const target = `@${username.toLowerCase()}`;
  return entities.some(
    (e) => e.type === 'mention' && text.substring(e.offset, e.offset + e.length).toLowerCase() === target,
  );
}
