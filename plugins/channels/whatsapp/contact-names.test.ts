import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetContactNamesForTesting,
  applyMentionNames,
  lookupContactName,
  rememberContactName,
} from './contact-names';
import { CONTACT_NAME_CACHE_LIMIT } from './constants';

afterEach(() => _resetContactNamesForTesting());

describe('rememberContactName / lookupContactName', () => {
  it('remembers a name under every jid form given', () => {
    rememberContactName(['141789856067723@lid', '5511999999999@s.whatsapp.net', undefined], 'João');
    expect(lookupContactName('141789856067723')).toBe('João');
    expect(lookupContactName('5511999999999')).toBe('João');
  });

  it('trims the name and ignores empty names or jids', () => {
    rememberContactName(['5511999999999@s.whatsapp.net'], '  Maria  ');
    rememberContactName(['5599999999999@s.whatsapp.net'], '   ');
    rememberContactName([null, undefined], 'Nobody');
    expect(lookupContactName('5511999999999')).toBe('Maria');
    expect(lookupContactName('5599999999999')).toBeUndefined();
  });

  it('refreshes an existing entry without growing the cache', () => {
    rememberContactName(['5511999999999@s.whatsapp.net'], 'Old');
    rememberContactName(['5511999999999@s.whatsapp.net'], 'New');
    expect(lookupContactName('5511999999999')).toBe('New');
  });

  it('evicts the oldest entry past the cache limit (FIFO)', () => {
    rememberContactName(['5500000000000@s.whatsapp.net'], 'First');
    for (let i = 1; i <= CONTACT_NAME_CACHE_LIMIT; i++) {
      rememberContactName([`55000000000${String(i).padStart(2, '0')}@s.whatsapp.net`], `Name${i}`);
    }
    expect(lookupContactName('5500000000000')).toBeUndefined();
  });
});

describe('applyMentionNames', () => {
  const BOT_PN = '5562936181410';
  const BOT_LID = '162157312364643';

  it('swaps @<number> for @<name> for known users, in a LID group too', () => {
    rememberContactName(['5511999999999@s.whatsapp.net'], 'João');
    const out = applyMentionNames(
      `@5511999999999 e @${BOT_LID} vejam isso`,
      ['5511999999999@s.whatsapp.net', `${BOT_LID}@lid`],
      [BOT_PN, BOT_LID],
    );
    // known user -> name; bot token left for stripBotMention to remove
    expect(out).toBe(`@João e @${BOT_LID} vejam isso`);
  });

  it('leaves unknown users as @<number> and replaces every occurrence', () => {
    rememberContactName(['5511999999999@s.whatsapp.net'], 'João');
    const out = applyMentionNames(
      '@5511999999999 @5521111112222 @5511999999999',
      ['5511999999999@s.whatsapp.net', '5521111112222@s.whatsapp.net'],
      [BOT_PN, BOT_LID],
    );
    expect(out).toBe('@João @5521111112222 @João');
  });

  it('returns the text unchanged when there are no mentions', () => {
    expect(applyMentionNames('nada aqui', [], [BOT_PN, BOT_LID])).toBe('nada aqui');
  });
});
