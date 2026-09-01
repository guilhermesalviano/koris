import { describe, expect, it } from 'vitest';
import { buildChannelsPatch, mapRuntimeToForm, DEFAULT_FORM } from './use-settings-form';

describe('use-settings-form: allow_unlisted_senders', () => {
  it('maps ALLOW_UNLISTED_SENDERS from the runtime snapshot into the form', () => {
    const form = mapRuntimeToForm({
      CHANNELS: {
        TELEGRAM: { WHITELIST: '1', ALLOW_UNLISTED_SENDERS: true },
        WHATSAPP: { WHITELIST: '2', ALLOW_UNLISTED_SENDERS: false },
      },
    });
    expect(form.telegram.allow_unlisted_senders).toBe(true);
    expect(form.whatsapp.allow_unlisted_senders).toBe(false);
  });

  it('defaults allow_unlisted_senders to false when the snapshot omits it', () => {
    const form = mapRuntimeToForm({ CHANNELS: { TELEGRAM: { WHITELIST: '1' } } });
    expect(form.telegram.allow_unlisted_senders).toBe(false);
    expect(form.whatsapp.allow_unlisted_senders).toBe(false);
  });

  it('emits allow_unlisted_senders for both channels in the channels patch', () => {
    const form = {
      ...DEFAULT_FORM,
      telegram: { ...DEFAULT_FORM.telegram, allow_unlisted_senders: true },
      whatsapp: { ...DEFAULT_FORM.whatsapp, allow_unlisted_senders: false },
    };
    const patch = buildChannelsPatch(form) as {
      channels: { telegram: Record<string, unknown>; whatsapp: Record<string, unknown> };
    };
    expect(patch.channels.telegram.allow_unlisted_senders).toBe(true);
    expect(patch.channels.whatsapp.allow_unlisted_senders).toBe(false);
  });
});
