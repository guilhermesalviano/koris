import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWhatsAppJid, toWhatsAppJid } from './jid';
import { whatsappState } from './state';

afterEach(() => {
  whatsappState.botNumber = '';
});

describe('toWhatsAppJid', () => {
  it('passes a full user / group / lid JID through untouched', () => {
    expect(toWhatsAppJid('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
    expect(toWhatsAppJid('120363407821582446@g.us')).toBe('120363407821582446@g.us');
    expect(toWhatsAppJid('141789856067723@lid')).toBe('141789856067723@lid');
    expect(toWhatsAppJid('  5511999999999@s.whatsapp.net  ')).toBe('5511999999999@s.whatsapp.net');
  });

  it('turns a bare / loosely formatted phone number into a user JID', () => {
    expect(toWhatsAppJid('5511999998888')).toBe('5511999998888@s.whatsapp.net');
    expect(toWhatsAppJid('+55 (11) 99999-8888')).toBe('5511999998888@s.whatsapp.net');
    expect(toWhatsAppJid('0055 11 99999 8888')).toBe('5511999998888@s.whatsapp.net');
    expect(toWhatsAppJid('@5511999998888')).toBe('5511999998888@s.whatsapp.net');
  });

  it('leaves an empty or digitless value for Baileys to reject', () => {
    expect(toWhatsAppJid('')).toBe('');
    expect(toWhatsAppJid('   ')).toBe('');
    expect(toWhatsAppJid('not-a-number')).toBe('not-a-number');
  });
});

describe('resolveWhatsAppJid', () => {
  it('returns a caller-supplied full JID without calling onWhatsApp', async () => {
    const onWhatsApp = vi.fn();
    expect(await resolveWhatsAppJid('120363407821582446@g.us', { onWhatsApp })).toBe('120363407821582446@g.us');
    expect(onWhatsApp).not.toHaveBeenCalled();
  });

  it('canonicalizes a bare number via onWhatsApp (e.g. Brazil 9th-digit)', async () => {
    const onWhatsApp = vi.fn().mockResolvedValue([{ jid: '551199999999@s.whatsapp.net', exists: true }]);
    // caller passed the extra mobile 9; the real account has no 9
    expect(await resolveWhatsAppJid('55 11 9 9999-9999', { onWhatsApp })).toBe('551199999999@s.whatsapp.net');
  });

  it('prepends the bot country code when the number has none', async () => {
    whatsappState.botNumber = '5562999998888';
    const onWhatsApp = vi.fn().mockResolvedValue([
      { jid: '1199999999@s.whatsapp.net', exists: false },
      { jid: '551199999999@s.whatsapp.net', exists: true },
    ]);
    expect(await resolveWhatsAppJid('1199999999', { onWhatsApp })).toBe('551199999999@s.whatsapp.net');
    expect(onWhatsApp).toHaveBeenCalledWith('1199999999', '51199999999', '551199999999', '5561199999999');
  });

  it('falls back to the naive JID when onWhatsApp finds nothing', async () => {
    const onWhatsApp = vi.fn().mockResolvedValue([{ jid: '5511999998888@s.whatsapp.net', exists: false }]);
    expect(await resolveWhatsAppJid('5511999998888', { onWhatsApp })).toBe('5511999998888@s.whatsapp.net');
  });

  it('falls back to the naive JID when onWhatsApp throws or is absent', async () => {
    expect(await resolveWhatsAppJid('5511999998888', { onWhatsApp: vi.fn().mockRejectedValue(new Error('offline')) }))
      .toBe('5511999998888@s.whatsapp.net');
    expect(await resolveWhatsAppJid('5511999998888', {})).toBe('5511999998888@s.whatsapp.net');
  });
});
