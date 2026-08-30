import { describe, expect, it } from 'vitest';

import {
  applyAiRolePatch,
  hasLegacyAiShape,
  normalizeLegacyAi,
  resolveAiRoles,
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
    it('collapses manager + workers on the same provider/base_url into one entry with both models', () => {
      const out = normalizeLegacyAi({
        parallel: false,
        manager: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen', num_ctx: 8192, embedding: true, embed_model: 'nomic' },
      });

      expect(out.parallel).toBe(false);
      expect(out.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', num_ctx: 8192, models: ['gemma', 'qwen', 'nomic'] },
      ]);
      expect(out.roles).toEqual({
        manager: { provider: 'ollama', model: 'gemma' },
        workers: { provider: 'ollama', model: 'qwen' },
      });
      // num_ctx moves onto the provider entry; embeddings move to AI-wide keys.
      expect(out.embedding).toBe(true);
      expect(out.embed_model).toBe('nomic');
      expect(out).not.toHaveProperty('manager');
      expect(out).not.toHaveProperty('workers');
    });

    it('keeps distinct providers as separate entries', () => {
      const out = normalizeLegacyAi({
        manager: { provider: 'openai', base_url: '', api_token: 'sk-1', model: 'gpt-4o-mini' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen' },
      });

      expect(out.providers).toEqual([
        { provider: 'openai', base_url: '', api_token: 'sk-1', models: ['gpt-4o-mini'] },
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['qwen'] },
      ]);
    });
  });

  describe('resolveAiRoles', () => {
    it('joins a role pointer to its provider entry credentials', () => {
      const roles = resolveAiRoles({
        embedding: true,
        embed_model: 'nomic',
        providers: [
          { provider: 'ollama', base_url: 'http://host:11434', api_token: '', num_ctx: 32768, models: ['gemma', 'qwen'] },
          { provider: 'openai', base_url: '', api_token: 'sk-abc', models: ['gpt-4o-mini'] },
        ],
        roles: {
          manager: { provider: 'openai', model: 'gpt-4o-mini' },
          workers: { provider: 'ollama', model: 'qwen' },
        },
      });

      expect(roles.MANAGER).toEqual({ PROVIDER: 'openai', BASE_URL: '', API_TOKEN: 'sk-abc', MODEL: 'gpt-4o-mini' });
      expect(roles.WORKERS).toEqual({
        PROVIDER: 'ollama',
        BASE_URL: 'http://host:11434',
        API_TOKEN: '',
        MODEL: 'qwen',
        EMBEDDING_ENABLED: true,
        EMBED_MODEL: 'nomic',
        NUM_CTX: 32768,
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

    it('auto-migrates a legacy ai block', () => {
      const roles = resolveAiRoles({
        manager: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'gemma' },
        workers: { provider: 'ollama', base_url: 'http://host:11434', api_token: '', model: 'qwen', num_ctx: 4096 },
      });

      expect(roles.MANAGER.MODEL).toBe('gemma');
      expect(roles.WORKERS.MODEL).toBe('qwen');
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
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma'] }],
      };

      upsertAiProvider(ai, { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', model: 'gpt-4o-mini' });

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma'] },
        { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', models: ['gpt-4o-mini'] },
      ]);
    });

    it('appends a model to an existing provider and does not overwrite creds with blanks', () => {
      const ai: Record<string, unknown> = {
        providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: 'keep', models: ['gemma'] }],
      };

      upsertAiProvider(ai, { provider: 'ollama', base_url: '', api_token: '', model: 'qwen' });

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: 'keep', models: ['gemma', 'qwen'] },
      ]);
    });
  });

  describe('applyAiRolePatch', () => {
    it('repoints a role and grows the provider array without dropping other providers', () => {
      const base = {
        web_port: 3000,
        ai: {
          providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma', 'qwen'] }],
          roles: {
            manager: { provider: 'ollama', model: 'gemma' },
            workers: { provider: 'ollama', model: 'qwen' },
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
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma', 'qwen'] },
        { provider: 'openai', base_url: 'https://api.openai.com/v1', api_token: 'sk-1', models: ['gpt-4o-mini'] },
      ]);
      expect(ai.roles).toEqual({
        manager: { provider: 'openai', model: 'gpt-4o-mini' },
        workers: { provider: 'ollama', model: 'qwen' },
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
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['gemma', 'qwen', 'qwen-v2'] },
      ]);
      expect((ai.roles as Record<string, unknown>).workers).toEqual({ provider: 'ollama', model: 'qwen-v2' });
    });

    it('stores num_ctx on the provider entry and embeddings AI-wide, not on the role', () => {
      const base = {
        ai: {
          providers: [{ provider: 'ollama', base_url: 'http://host:11434', api_token: '', models: ['qwen'] }],
          roles: {
            manager: { provider: 'ollama', model: 'gemma' },
            workers: { provider: 'ollama', model: 'qwen' },
          },
        },
      };

      const out = applyAiRolePatch(base, 'workers', {
        provider: 'ollama',
        model: 'qwen',
        num_ctx: 32768,
        embedding: true,
        embed_model: 'nomic-embed-text',
      });
      const ai = out.ai as Record<string, unknown>;

      expect(ai.providers).toEqual([
        { provider: 'ollama', base_url: 'http://host:11434', api_token: '', num_ctx: 32768, models: ['qwen'] },
      ]);
      expect(ai.embedding).toBe(true);
      expect(ai.embed_model).toBe('nomic-embed-text');
      expect((ai.roles as Record<string, unknown>).workers).toEqual({ provider: 'ollama', model: 'qwen' });
    });
  });
});
