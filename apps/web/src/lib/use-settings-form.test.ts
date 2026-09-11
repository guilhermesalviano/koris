import { describe, expect, it } from 'vitest';
import { buildChannelsPatch, buildGeneralPatch, buildSettingsPatch, buildSkillsPatch, mapRuntimeToForm, DEFAULT_FORM } from './use-settings-form';

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

describe('use-settings-form: num_ctx', () => {
  it('maps NUM_CTX from the runtime snapshot into each profile form', () => {
    const form = mapRuntimeToForm({
      AI: { MANAGER: { PROVIDER: 'openrouter', MODEL: 'qwen', NUM_CTX: 80000 }, WORKERS: { PROVIDER: 'ollama', MODEL: 'gemma' } },
    });
    expect(form.manager.num_ctx).toBe('80000');
    expect(form.workers.num_ctx).toBe('');
    expect(form.sameForBoth).toBe(false);
  });

  it('emits a floored positive num_ctx and omits a blank/zero one', () => {
    const withValue = buildSettingsPatch({
      ...DEFAULT_FORM,
      sameForBoth: false,
      manager: { ...DEFAULT_FORM.manager, provider: 'openrouter', model: 'qwen', num_ctx: '32768' },
      workers: { ...DEFAULT_FORM.workers, provider: 'ollama', model: 'gemma', num_ctx: '0' },
    }) as { ai: { manager: Record<string, unknown>; workers: Record<string, unknown> } };
    expect(withValue.ai.manager.num_ctx).toBe(32768);
    expect(withValue.ai.workers.num_ctx).toBeUndefined();
  });
});

describe('use-settings-form: skills', () => {
  it('maps SKILLS from the runtime settings', () => {
    const form = mapRuntimeToForm({ SKILLS: { MODE: 'manual', LIMIT: 4 } });

    expect(form.skills_mode).toBe('manual');
    expect(form.skills_limit).toBe('4');
  });

  it('falls back to auto when SKILLS is absent or unrecognised', () => {
    expect(mapRuntimeToForm({}).skills_mode).toBe('auto');
    expect(mapRuntimeToForm({ SKILLS: { MODE: 'nope' as never } }).skills_mode).toBe('auto');
  });

  it('builds a skills patch with mode and limit', () => {
    expect(buildSkillsPatch({ ...DEFAULT_FORM, skills_mode: 'manual', skills_limit: '5' }))
      .toEqual({ skills: { mode: 'manual', limit: 5 } });
  });

  it('omits an empty or invalid limit so the server keeps the stored one', () => {
    expect(buildSkillsPatch({ ...DEFAULT_FORM, skills_limit: '' })).toEqual({ skills: { mode: 'auto' } });
    expect(buildSkillsPatch({ ...DEFAULT_FORM, skills_limit: '0' })).toEqual({ skills: { mode: 'auto' } });
    expect(buildSkillsPatch({ ...DEFAULT_FORM, skills_limit: 'abc' })).toEqual({ skills: { mode: 'auto' } });
  });
});


describe('general settings removals', () => {
  it('includes empty lists and maps so clearing the final entry is persisted', () => {
    expect(buildGeneralPatch({ ...DEFAULT_FORM, allowed_domains: [], personal_information: {} }))
      .toEqual({ allowed_domains: [], personal_information: {} });
  });
});
