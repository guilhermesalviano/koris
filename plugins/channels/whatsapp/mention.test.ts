import { describe, expect, it } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import { extractMentionedJids, isBotMentioned, jidToNumber, normalizeNumber, stripBotMention } from './mention';

describe('normalizeNumber', () => {
  it('strips spaces, plus signs and punctuation', () => {
    expect(normalizeNumber('+55 (11) 99999-8888')).toBe('5511999998888');
  });

  it('returns an empty string when there are no digits', () => {
    expect(normalizeNumber('')).toBe('');
    expect(normalizeNumber('korisbot')).toBe('');
  });
});

describe('jidToNumber', () => {
  it('strips a device suffix and the JID domain', () => {
    expect(jidToNumber('5511999998888:7@s.whatsapp.net')).toBe('5511999998888');
    expect(jidToNumber('5511999998888@lid')).toBe('5511999998888');
    expect(jidToNumber('5511999998888@s.whatsapp.net')).toBe('5511999998888');
  });
});

describe('extractMentionedJids', () => {
  const wa = (message: unknown): WAMessage => ({ message } as WAMessage);

  it('reads mentionedJid from an extendedTextMessage contextInfo', () => {
    const msg = wa({
      extendedTextMessage: { text: 'hi', contextInfo: { mentionedJid: ['5511999998888@s.whatsapp.net'] } },
    });
    expect(extractMentionedJids(msg)).toEqual(['5511999998888@s.whatsapp.net']);
  });

  it('reads mentionedJid from an image caption contextInfo', () => {
    const msg = wa({
      imageMessage: { caption: 'look', contextInfo: { mentionedJid: ['5521888887777@lid'] } },
    });
    expect(extractMentionedJids(msg)).toEqual(['5521888887777@lid']);
  });

  it('returns an empty array when there is no mention metadata', () => {
    expect(extractMentionedJids(wa({ conversation: 'plain text' }))).toEqual([]);
    expect(extractMentionedJids(wa(undefined))).toEqual([]);
  });
});

describe('isBotMentioned', () => {
  const PN = '5562936181410';
  const LID = '162157312364643';

  it('is false when no bot id is known', () => {
    expect(isBotMentioned(`@${PN} hi`, [`${PN}@s.whatsapp.net`], ['', ''])).toBe(false);
  });

  it('matches a phone-number mentionedJid (PN-addressed group)', () => {
    expect(isBotMentioned('hey help me', [`${PN}:3@s.whatsapp.net`], [PN, LID])).toBe(true);
  });

  it('matches a LID mentionedJid (LID-addressed group)', () => {
    expect(isBotMentioned('@162157312364643 eai mano', [`${LID}@lid`], [PN, LID])).toBe(true);
  });

  it('matches a LID even when only the LID is known', () => {
    expect(isBotMentioned('@162157312364643 eai mano', [`${LID}@lid`], ['', LID])).toBe(true);
  });

  it('falls back to an @<id> substring in the text', () => {
    expect(isBotMentioned(`hey @${PN} help me`, [], [PN, LID])).toBe(true);
  });

  it('is false when neither the metadata nor the text names the bot', () => {
    expect(isBotMentioned('hey @5500000000000 help me', ['5500000000000@s.whatsapp.net'], [PN, LID])).toBe(false);
  });
});

describe('stripBotMention', () => {
  it('removes an @<lid> token and tidies whitespace', () => {
    expect(stripBotMention('@162157312364643 eai mano', ['5562936181410', '162157312364643'])).toBe('eai mano');
  });

  it('removes an @<phone> token', () => {
    expect(stripBotMention('hey @5562936181410 help', ['5562936181410', ''])).toBe('hey help');
  });

  it('leaves text untouched when no bot id appears', () => {
    expect(stripBotMention('nothing to strip here', ['5562936181410', '162157312364643'])).toBe('nothing to strip here');
  });
});
