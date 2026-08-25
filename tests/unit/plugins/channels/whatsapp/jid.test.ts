import { describe, expect, it } from 'vitest';
import { parseMentionTarget } from '../../../../../plugins/channels/whatsapp/jid';

describe('plugins/whatsapp/jid parseMentionTarget', () => {
  it('converts a numeric mention id to a lid jid', () => {
    expect(parseMentionTarget('@5511999999999')).toBe('5511999999999@lid');
  });

  it('trims surrounding whitespace before converting', () => {
    expect(parseMentionTarget('  @5511999999999  ')).toBe('5511999999999@lid');
  });

  it('leaves full jids untouched', () => {
    expect(parseMentionTarget('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
    expect(parseMentionTarget('12036302@g.us')).toBe('12036302@g.us');
    expect(parseMentionTarget('9982166447@lid')).toBe('9982166447@lid');
  });

  it('leaves bare numbers untouched', () => {
    expect(parseMentionTarget('5511999999999')).toBe('5511999999999');
  });

  it('leaves non-numeric mentions untouched', () => {
    expect(parseMentionTarget('@foo')).toBe('@foo');
    expect(parseMentionTarget('@5511abc')).toBe('@5511abc');
  });

  it('returns empty strings unchanged', () => {
    expect(parseMentionTarget('')).toBe('');
    expect(parseMentionTarget('   ')).toBe('');
  });
});
