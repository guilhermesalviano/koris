import { describe, expect, it } from 'vitest';

import {
  applyAiEmbedPatch,
  applyAiProviderPatch,
  applyAiRolePatch,
  hasLegacyAiShape,
  normalizeLegacyAi,
  resolveAiRoles,
  resolveEmbed,
  upsertAiProvider,
} from './ai-config';

describe('config/ai-config', () => {
  describe('hasLegacyAiShape', () => {
    it('is true for an ai block with manager/workers and no providers/roles', () => {
      expect(hasLegacyAiShape({ manager: { provider: 'ollama' } })).toBe(true);
      expect(hasLegacyAiShape({ workers: { provider: 'ollama' } })).toBe(true);
    });

    it('is false once providers or roles are present', () => {
      expect(hasLegacyAiShape({ manager: { provider: 'ollama' }, providers: [] })).toBe(false);
      expect(hasLegacyAiShape({ roles: {} })).toBe(false);
      expect(hasLegacyAiShape({ providers: [] })).toBe(false);
    });

    it('is false for non-objects', () => {
      expect(hasLegacyAiShape(undefined)).toBe(false);
      expect(hasLegacyAiShape('ollama')).toBe(false);
    });
  });

  describe('normalizeLegacyAi', () => {
    it('collapses manager + workers on the same provider/base_url into one entry (first model wins) and builds ai.embed', () => {
      const out = normalizeLegacyAi({
        parallel: false,
        manager: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen', num_ctx: 8192, embedding: true, embed_model: 'nomic' },
      });

      expect(out.parallel).toBe(false);
      expect(out.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', num_ctx: 8192, model: 'gemma' },
      ]);
      expect(out.roles).toEqual({
        manager: { provider: 'ollama' },
        workers: { provider: 'ollama' },
      });
      // num_ctx moves onto the provider entry; embeddings move onto ai.embed.
      expect(out.embed).toEqual({ enabled: true, provider: 'ollama', model: 'nomic' });
      expect(out).not.toHaveProperty('manager');
      expect(out).not.toHaveProperty('workers');
      expect(out).not.toHaveProperty('embedding');
      expect(out).not.toHaveProperty('embed_model');
    });

    it('keeps distinct providers as separate entries', () => {
      const out = normalizeLegacyAi({
        manager: { provider: 'openai', base_url: '', api_token: 'sk-1', model: 'gpt-4o-mini' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen' },
      });

      expect(out.providers).toEqual([
        { provider: 'openai', base_url: '', api_token: 'sk-1', model: 'gpt-4o-mini' },
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen' },
      ]);
      expect(out.embed).toEqual({ enabled: false, provider: 'ollama', model: 'nomic-embed-text' });
    });
  });

  describe('resolveAiRoles', () => {
    it('joins a role pointer to its provider entry credentials and model', () => {
      const roles = resolveAiRoles({
        embed: { enabled: true, provider: 'ollama', model: 'nomic' },
        providers: [
          { provider: 'ollama', base_url: 'http://host:11434', api_token: '', num_ctx: 32768, model: 'gemma' },
          { provider: 'openai', base_url: '', api_token: 'sk-abc', model: 'gpt-4o-mini' },
        ],
        roles: {
          manager: { provider: 'openai' },
          workers: { provider: 'ollama' },
        },
      });

      expect(roles.MANAGER).toEqual({ PROVIDER: 'openai', BASE_URL: '', API_TOKEN: 'sk-abc', MODEL: 'gpt-4o-mini' });
      expect(roles.WORKERS).toEqual({
        PROVIDER: 'ollama',
        BASE_URL: 'http://host:11434',
        API_TOKEN: '',
        MODEL: 'gemma',
        NUM_CTX: 32768,
      });
      expect(roles.EMBED).toEqual({
        ENABLED: true,
        PROVIDER: 'ollama',
        BASE_URL: 'http://host:11434',
        API_TOKEN: '',
        MODEL: 'nomic',
      });
    });

    it('falls back to defaults for a role pointing at an unknown provider', () => {
      const roles = resolveAiRoles({
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma'] }],
        roles: { manager: { provider: 'lmstudio', model: 'local-model' } },
      });

      expect(roles.MANAGER.PROVIDER).toBe('lmstudio');
      expect(roles.MANAGER.BASE_URL).toBe('');
      expect(roles.MANAGER.API_TOKEN).toBe('');
      expect(roles.MANAGER.MODEL).toBe('local-model');
    });

    it('auto-migrates a legacy ai block (manager + workers collapse to one entry/model)', () => {
      const roles = resolveAiRoles({
        manager: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen', num_ctx: 4096 },
      });

      expect(roles.MANAGER.MODEL).toBe('gemma');
      // 1:1 provider↔model: both roles share the single ollama entry model.
      expect(roles.WORKERS.MODEL).toBe('gemma');
      expect(roles.WORKERS.NUM_CTX).toBe(4096);
      expect(roles.MANAGER.BASE_URL).toBe('http://host:11434');
    });

    it('uses built-in defaults for an empty ai block', () => {
      const roles = resolveAiRoles({});
      expect(roles.MANAGER.PROVIDER).toBe('ollama');
      expect(roles.MANAGER.MODEL).toBe('gemma4:e2b');
      expect(roles.WORKERS.MODEL).toBe('qwen:3.5:2b');
      expect(roles.WORKERS.NUM_CTX).toBe(16384);
    });
  });

  describe('upsertAiProvider', () => {
    it('adds a new provider and preserves existing ones', () => {
      const ai: Record<string, unknown> = {
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' }],
      };

      upsertAiProvider(ai, { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', model: 'gpt-4o-mini' });

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', model: 'gpt-4o-mini' },
      ]);
    });

    it('overwrites the model on an existing provider and does not overwrite creds with blanks', () => {
      const ai: Record<string, unknown> = {
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: 'keep', model: 'gemma' }],
      };

      upsertAiProvider(ai, { provider: 'ollama', base_url: '', api_token: '', model: 'qwen' });

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: 'keep', model: 'qwen' },
      ]);
    });

    it('folds a legacy models[] array into a single model and drops it', () => {
      const ai: Record<string, unknown> = {
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma', 'qwen'] }],
      };

      upsertAiProvider(ai, { provider: 'ollama', base_url: 'http://host:11434', api_token: '' });

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
      ]);
    });
  });

  describe('applyAiRolePatch', () => {
    it('repoints a role to a { provider } pointer and grows the provider array without dropping other providers', () => {
      const base = {
        web_port: 3000,
        ai: {
          providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' }],
          roles: {
            manager: { provider: 'ollama' },
            workers: { provider: 'ollama' },
          },
        },
      };

      const out = applyAiRolePatch(base, 'manager', {
        provider: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_token: 'sk-1',
        model: 'gpt-4o-mini',
      });

      expect(out.web_port).toBe(3000);
      const ai = out.ai as Record<string, unknown>;
      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', model: 'gpt-4o-mini' },
      ]);
      expect(ai.roles).toEqual({
        manager: { provider: 'openai' },
        workers: { provider: 'ollama' },
      });
      // input not mutated
      expect(base.ai.providers).toHaveLength(1);
    });

    it('migrates a legacy base and drops the per-role blocks', () => {
      const base = {
        ai: {
          manager: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
          workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen' },
        },
      };

      const out = applyAiRolePatch(base, 'workers', { provider: 'ollama', model: 'qwen-v2' });
      const ai = out.ai as Record<string, unknown>;

      expect(ai).not.toHaveProperty('manager');
      expect(ai).not.toHaveProperty('workers');
      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen-v2' },
      ]);
      expect((ai.roles as Record<string, unknown>).workers).toEqual({ provider: 'ollama' });
    });

    it('stores num_ctx on the provider entry, not on the role pointer', () => {
      const base = {
        ai: {
          providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen' }],
          roles: {
            manager: { provider: 'ollama' },
            workers: { provider: 'ollama' },
          },
        },
      };

      const out = applyAiRolePatch(base, 'workers', {
        provider: 'ollama',
        model: 'qwen',
        num_ctx: 32768,
      });
      const ai = out.ai as Record<string, unknown>;

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen', num_ctx: 32768 },
      ]);
      expect((ai.roles as Record<string, unknown>).workers).toEqual({ provider: 'ollama' });
    });
  });

  describe('resolveEmbed', () => {
    it('joins the ai.embed pointer to its provider entry creds', () => {
      const embed = resolveEmbed({
        providers: [
          { provider: 'ollama', base_url: 'http://host:11434', api_token: 'tok', model: 'gemma' },
        ],
        roles: { manager: { provider: 'ollama' }, workers: { provider: 'ollama' } },
        embed: { enabled: true, provider: 'ollama', model: 'nomic-embed-text' },
      });

      expect(embed).toEqual({
        ENABLED: true,
        PROVIDER: 'ollama',
        BASE_URL: 'http://host:11434',
        API_TOKEN: 'tok',
        MODEL: 'nomic-embed-text',
      });
    });

    it('reads back-compat AI-wide ai.embedding / ai.embed_model keys', () => {
      const embed = resolveEmbed({
        embedding: true,
        embed_model: 'nomic',
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' }],
        roles: { workers: { provider: 'ollama' } },
      });

      expect(embed.ENABLED).toBe(true);
      expect(embed.PROVIDER).toBe('ollama');
      expect(embed.MODEL).toBe('nomic');
      expect(embed.BASE_URL).toBe('http://host:11434');
    });

    it('reads legacy per-workers embedding fields', () => {
      const embed = resolveEmbed({
        manager: { provider: 'ollama', base_url: 'http://host:11434', model: 'gemma' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', model: 'qwen', embedding: true, embed_model: 'nomic' },
      });

      expect(embed.ENABLED).toBe(true);
      expect(embed.PROVIDER).toBe('ollama');
      expect(embed.MODEL).toBe('nomic');
    });

    it('defaults to disabled ollama / nomic-embed-text', () => {
      const embed = resolveEmbed({});
      expect(embed).toEqual({
        ENABLED: false,
        PROVIDER: 'ollama',
        BASE_URL: '',
        API_TOKEN: '',
        MODEL: 'nomic-embed-text',
      });
    });
  });

  describe('applyAiEmbedPatch', () => {
    it('sets ai.embed and upserts the provider creds without clobbering its chat model', () => {
      const base = {
        ai: {
          providers: [
            { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
            { provider: 'openai', base_url: '', api_token: 'sk-1', model: 'gpt-4o-mini' },
          ],
          roles: { manager: { provider: 'ollama' }, workers: { provider: 'openai' } },
        },
      };

      const out = applyAiEmbedPatch(base, { enabled: true, provider: 'ollama', model: 'nomic-embed-text' });
      const ai = out.ai as Record<string, unknown>;

      expect(ai.embed).toEqual({ enabled: true, provider: 'ollama', model: 'nomic-embed-text' });
      // the ollama entry keeps its chat model — the embed model lives on ai.embed
      expect((ai.providers as { provider: string; model: string }[]).find((p) => p.provider === 'ollama')?.model).toBe('gemma');
      expect(ai.roles).toEqual({ manager: { provider: 'ollama' }, workers: { provider: 'openai' } });
    });

    it('migrates a legacy base and drops ai.embedding / ai.embed_model', () => {
      const base = {
        ai: {
          embedding: true,
          embed_model: 'old-embed',
          manager: { provider: 'ollama', base_url: 'http://host:11434', model: 'gemma' },
          workers: { provider: 'ollama', base_url: 'http://host:11434', model: 'qwen' },
        },
      };

      const out = applyAiEmbedPatch(base, { provider: 'ollama', model: 'nomic-embed-text' });
      const ai = out.ai as Record<string, unknown>;

      expect(ai).not.toHaveProperty('embedding');
      expect(ai).not.toHaveProperty('embed_model');
      expect(ai).not.toHaveProperty('manager');
      expect(ai.embed).toEqual({ enabled: true, provider: 'ollama', model: 'nomic-embed-text' });
    });
  });

  describe('applyAiProviderPatch', () => {
    it('upserts the provider without touching either role pointer', () => {
      const base = {
        ai: {
          providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma'] }],
          roles: {
            manager: { provider: 'ollama', model: 'gemma' },
            workers: { provider: 'ollama', model: 'gemma' },
          },
        },
      };

      const out = applyAiProviderPatch(base, {
        provider: 'nvidia',
        api_token: 'nv-key',
        model: 'meta/llama-3.3-70b-instruct',
      });
      const ai = out.ai as Record<string, unknown>;

      expect((ai.providers as { provider: string }[]).map((p) => p.provider)).toEqual(['ollama', 'nvidia']);
      expect(ai.roles).toEqual({
        manager: { provider: 'ollama', model: 'gemma' },
        workers: { provider: 'ollama', model: 'gemma' },
      });
    });
  });
});
