/**
 * AI provider config shape + resolution.
 *
 * `koris.json` keeps every configured provider in `ai.providers[]` (each with
 * its own credentials, context size, and a single `model` name) and points
 * each role at one of them through `ai.roles`. Embeddings have their own
 * pointer (`ai.embed`), not a per-role setting:
 *
 *   "ai": {
 *     "providers": [
 *       { "provider": "ollama", "base_url": "…", "api_token": "", "num_ctx": 32768,
 *         "model": "gemma4:e4b" },
 *       { "provider": "openai", "base_url": "", "api_token": "sk-…", "model": "gpt-4o-mini" }
 *     ],
 *     "roles": {
 *       "manager": { "provider": "ollama" },
 *       "workers": { "provider": "openai" }
 *     },
 *     "embed": { "enabled": false, "provider": "ollama", "model": "nomic-embed-text" }
 *   }
 *
 * The legacy shape (`ai.manager` / `ai.workers` objects, one provider each,
 * per-role `num_ctx` / `embedding` / `embed_model`) is auto-migrated in memory
 * by `resolveAiRoles`; the file is rewritten to the new shape on the next
 * settings save (`applyAiRolePatch`).
 */

export interface ResolvedRoleProfile {
  PROVIDER: string;
  BASE_URL: string;
  API_TOKEN: string;
  MODEL: string;
}

export interface ResolvedWorkersProfile extends ResolvedRoleProfile {
  NUM_CTX: number;
}

export interface ResolvedEmbedProfile {
  ENABLED: boolean;
  PROVIDER: string;
  BASE_URL: string;
  API_TOKEN: string;
  MODEL: string;
}

export interface ResolvedAiRoles {
  MANAGER: ResolvedRoleProfile;
  WORKERS: ResolvedWorkersProfile;
  EMBED: ResolvedEmbedProfile;
}

export interface AiProviderPatch {
  provider: string;
  base_url?: string;
  api_token?: string;
  /** The provider entry's single model. */
  model?: string;
  /** Context window for this provider (stored on the provider entry). */
  num_ctx?: number;
}

// A role patch carries exactly the same fields as a provider patch (the model
// lands on the provider entry, the role pointer only stores `{ provider }`).
export type AiRolePatch = AiProviderPatch;

export interface AiEmbedPatch {
  enabled?: boolean;
  provider: string;
  model?: string;
  base_url?: string;
  api_token?: string;
}

/** Hard-coded fallbacks — mirror the historical defaults in config/index.ts. */
const DEFAULT_MANAGER: ResolvedRoleProfile = {
  PROVIDER: 'ollama',
  BASE_URL: '',
  API_TOKEN: '',
  MODEL: 'gemma4:e2b',
};

const DEFAULT_WORKERS: ResolvedWorkersProfile = {
  PROVIDER: 'ollama',
  BASE_URL: '',
  API_TOKEN: '',
  MODEL: 'qwen:3.5:2b',
  NUM_CTX: 16384,
};

const DEFAULT_EMBED_PROVIDER = 'ollama';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getOrCreateRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = obj[key];
  if (isRecord(existing)) return existing;
  const created: Record<string, unknown> = {};
  obj[key] = created;
  return created;
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  return String(value) === 'true';
}

/** First defined value among the args (skips `undefined` / `null`). */
function firstDefined(...values: unknown[]): unknown {
  return values.find((v) => v !== undefined && v !== null);
}

/** The single model stored on a provider entry (back-compat: old `models[]`). */
function entryModel(entry: Record<string, unknown> | undefined): string {
  if (!entry) return '';
  if (typeof entry.model === 'string' && entry.model.trim()) return entry.model;
  if (Array.isArray(entry.models)) {
    const first = (entry.models as unknown[]).find((m): m is string => typeof m === 'string' && !!m.trim());
    if (first) return first;
  }
  return '';
}

/**
 * True when `ai` still uses the legacy per-role shape: an `ai.manager` or
 * `ai.workers` object and no `ai.providers` / `ai.roles`.
 */
export function hasLegacyAiShape(ai: unknown): boolean {
  if (!isRecord(ai)) return false;
  if ('providers' in ai || 'roles' in ai) return false;
  return isRecord(ai.manager) || isRecord(ai.workers);
}

/**
 * Converts the legacy `ai.manager` / `ai.workers` shape into the new
 * `providers[]` + `roles` + `embed` shape, preserving every other `ai.*` key.
 * The two profiles collapse into one provider entry when they share a provider
 * name + base_url (the first non-empty `model` wins for that entry); the legacy
 * per-role `num_ctx` moves onto that entry and `embedding` / `embed_model`
 * move onto the new `ai.embed` pointer.
 */
export function normalizeLegacyAi(ai: unknown): Record<string, unknown> {
  const source = isRecord(ai) ? ai : {};
  const manager = isRecord(source.manager) ? source.manager : {};
  const workers = isRecord(source.workers) ? source.workers : {};

  const providers: Record<string, unknown>[] = [];
  const upsert = (profile: Record<string, unknown>): void => {
    const name = typeof profile.provider === 'string' ? profile.provider : '';
    if (!name) return;
    const baseUrl = strOr(profile.base_url, '');
    let entry = providers.find(
      (e) => e.provider === name && strOr(e.base_url, '') === baseUrl,
    );
    if (!entry) {
      entry = {
        provider: name,
        base_url: baseUrl,
        api_token: strOr(profile.api_token, ''),
        model: strOr(profile.model, ''),
      };
      providers.push(entry);
    } else if (!strOr(entry.api_token, '') && typeof profile.api_token === 'string' && profile.api_token) {
      entry.api_token = profile.api_token;
    }
    if (profile.num_ctx !== undefined && entry.num_ctx === undefined) {
      entry.num_ctx = profile.num_ctx;
    }
    if (!strOr(entry.model, '') && strOr(profile.model, '')) {
      entry.model = profile.model;
    }
  };
  upsert(manager);
  upsert(workers);

  const rest: Record<string, unknown> = { ...source };
  delete rest.manager;
  delete rest.workers;
  delete rest.embedding;
  delete rest.embed_model;

  const normalized: Record<string, unknown> = {
    ...rest,
    providers,
    roles: {
      manager: { provider: strOr(manager.provider, DEFAULT_MANAGER.PROVIDER) },
      workers: { provider: strOr(workers.provider, DEFAULT_WORKERS.PROVIDER) },
    },
    embed: {
      enabled: boolOr(firstDefined(source.embedding, workers.embedding), false),
      provider: strOr(firstDefined(workers.provider, manager.provider), DEFAULT_EMBED_PROVIDER),
      model: strOr(firstDefined(source.embed_model, workers.embed_model), DEFAULT_EMBED_MODEL),
    },
  };
  return normalized;
}

function findEntry(
  providers: Record<string, unknown>[],
  name: string,
): Record<string, unknown> | undefined {
  return providers.find((p) => isRecord(p) && p.provider === name);
}

function resolveRole(
  pointer: unknown,
  providers: Record<string, unknown>[],
  fallback: ResolvedRoleProfile,
): ResolvedRoleProfile {
  const ptr = isRecord(pointer) ? pointer : {};
  const providerName = strOr(ptr.provider, fallback.PROVIDER);
  const entry = findEntry(providers, providerName);
  return {
    PROVIDER: providerName,
    BASE_URL: entry ? strOr(entry.base_url, fallback.BASE_URL) : fallback.BASE_URL,
    API_TOKEN: entry ? strOr(entry.api_token, fallback.API_TOKEN) : fallback.API_TOKEN,
    // Model now comes from the provider entry, not the role pointer
    // (back-compat: an old pointer `model` is still read as a last resort).
    MODEL: entryModel(entry) || strOr(ptr.model, '') || fallback.MODEL,
  };
}

function providerList(ai: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(ai.providers)
    ? (ai.providers as unknown[]).filter(isRecord)
    : [];
}

/**
 * Resolves the embeddings profile from the raw `ai` block. Reads the new
 * `ai.embed` pointer, with a back-compat fallback to the old AI-wide
 * `ai.embedding` / `ai.embed_model` keys and the legacy per-`workers` fields.
 * base_url / api_token are joined from the matching `ai.providers[]` entry.
 */
export function resolveEmbed(aiRaw: unknown): ResolvedEmbedProfile {
  const ai = hasLegacyAiShape(aiRaw) ? normalizeLegacyAi(aiRaw) : (isRecord(aiRaw) ? aiRaw : {});
  const providers = providerList(ai);
  const embed = isRecord(ai.embed) ? ai.embed : {};
  const roles = isRecord(ai.roles) ? ai.roles : {};
  const workersPtr = isRecord(roles.workers) ? roles.workers : {};

  const enabled = boolOr(firstDefined(embed.enabled, ai.embedding, workersPtr.embedding), false);
  const providerName = strOr(firstDefined(embed.provider, workersPtr.provider), DEFAULT_EMBED_PROVIDER);
  const model = strOr(firstDefined(embed.model, ai.embed_model, workersPtr.embed_model), DEFAULT_EMBED_MODEL);
  const entry = findEntry(providers, providerName);

  return {
    ENABLED: enabled,
    PROVIDER: providerName,
    BASE_URL: entry ? strOr(entry.base_url, '') : '',
    API_TOKEN: entry ? strOr(entry.api_token, '') : '',
    MODEL: model,
  };
}

/**
 * Resolves `config.AI.MANAGER` / `config.AI.WORKERS` / `config.AI.EMBED` from
 * the raw `ai` block of koris.json — new shape or legacy. Pure: no env access,
 * that layering stays in config/index.ts.
 */
export function resolveAiRoles(aiRaw: unknown): ResolvedAiRoles {
  const ai = hasLegacyAiShape(aiRaw) ? normalizeLegacyAi(aiRaw) : (isRecord(aiRaw) ? aiRaw : {});
  const providers = providerList(ai);
  const roles = isRecord(ai.roles) ? ai.roles : {};
  const workersPtr = isRecord(roles.workers) ? roles.workers : {};

  const manager = resolveRole(roles.manager, providers, DEFAULT_MANAGER);
  const workersBase = resolveRole(roles.workers, providers, DEFAULT_WORKERS);
  const workersEntry = findEntry(providers, workersBase.PROVIDER);

  return {
    MANAGER: manager,
    WORKERS: {
      ...workersBase,
      // Context size lives on the provider entry (back-compat: old role field).
      NUM_CTX: numOr(firstDefined(workersEntry?.num_ctx, workersPtr.num_ctx), DEFAULT_WORKERS.NUM_CTX),
    },
    EMBED: resolveEmbed(ai),
  };
}

/**
 * Adds or updates a provider entry in `ai.providers[]` in place. Credentials
 * are only overwritten when the patch supplies a non-empty value (so a blank
 * token from the UI keeps the stored one); `num_ctx`, when given, is stored on
 * the entry; the entry keeps a single `model` string, overwritten when the
 * patch supplies a non-empty one. Any legacy `models[]` array is folded into
 * `model` and removed. Mutates `ai`.
 */
export function upsertAiProvider(ai: Record<string, unknown>, patch: AiProviderPatch): void {
  const providers = Array.isArray(ai.providers)
    ? (ai.providers as Record<string, unknown>[])
    : [];
  ai.providers = providers;

  let entry = providers.find((p) => isRecord(p) && p.provider === patch.provider);
  if (!entry) {
    entry = { provider: patch.provider, base_url: '', api_token: '', model: '' };
    providers.push(entry);
  }
  if (typeof entry.base_url !== 'string') entry.base_url = '';
  if (typeof entry.api_token !== 'string') entry.api_token = '';
  if (typeof entry.model !== 'string') entry.model = entryModel(entry);
  if (Array.isArray(entry.models)) delete entry.models;

  if (typeof patch.base_url === 'string' && patch.base_url.trim()) {
    entry.base_url = patch.base_url;
  }
  if (typeof patch.api_token === 'string' && patch.api_token.trim()) {
    entry.api_token = patch.api_token;
  }
  if (typeof patch.num_ctx === 'number' && Number.isFinite(patch.num_ctx)) {
    entry.num_ctx = patch.num_ctx;
  }
  if (typeof patch.model === 'string' && patch.model.trim()) {
    entry.model = patch.model;
  }
}

/**
 * Returns a copy of `base` with `patch` upserted into `ai.providers[]` (every
 * other provider and both role pointers left intact), plus any legacy
 * `ai.manager` / `ai.workers` blocks migrated. Use this to save a provider's
 * config without making it the active provider for any role.
 */
export function applyAiProviderPatch(
  base: Record<string, unknown>,
  patch: AiProviderPatch,
): Record<string, unknown> {
  const next = structuredClone(base);
  let ai = getOrCreateRecord(next, 'ai');
  if (hasLegacyAiShape(ai)) {
    ai = normalizeLegacyAi(ai);
    next.ai = ai;
  }
  delete ai.manager;
  delete ai.workers;
  upsertAiProvider(ai, patch);
  return next;
}

/**
 * Returns a copy of `base` with the given role repointed at `patch.provider`,
 * the provider upserted into `ai.providers[]` (every other provider left
 * intact, the chosen model landing on the entry), and any legacy
 * `ai.manager` / `ai.workers` blocks dropped. The role pointer is written as
 * `{ provider }` only — the model is resolved from the provider entry.
 */
export function applyAiRolePatch(
  base: Record<string, unknown>,
  role: 'manager' | 'workers',
  patch: AiRolePatch,
): Record<string, unknown> {
  const next = structuredClone(base);
  let ai = getOrCreateRecord(next, 'ai');
  if (hasLegacyAiShape(ai)) {
    ai = normalizeLegacyAi(ai);
    next.ai = ai;
  }
  delete ai.manager;
  delete ai.workers;

  upsertAiProvider(ai, patch);

  const roles = getOrCreateRecord(ai, 'roles');
  roles[role] = { provider: patch.provider };

  return next;
}

/**
 * Returns a copy of `base` with the `ai.embed` pointer set to
 * `{ enabled, provider, model }`. The provider's credentials are upserted into
 * `ai.providers[]` (base_url / api_token reused from / written onto the
 * matching entry — the embed model is NOT written onto the entry since it can
 * differ from that provider's chat model). Any legacy `ai.manager` /
 * `ai.workers` blocks are migrated and the old `ai.embedding` /
 * `ai.embed_model` keys are dropped.
 */
export function applyAiEmbedPatch(
  base: Record<string, unknown>,
  patch: AiEmbedPatch,
): Record<string, unknown> {
  const next = structuredClone(base);
  let ai = getOrCreateRecord(next, 'ai');
  if (hasLegacyAiShape(ai)) {
    ai = normalizeLegacyAi(ai);
    next.ai = ai;
  }
  delete ai.manager;
  delete ai.workers;
  delete ai.embedding;
  delete ai.embed_model;

  // Ensure the provider entry exists and carries the creds, but never write the
  // embed model onto it (a shared provider keeps its own chat `model`).
  upsertAiProvider(ai, {
    provider: patch.provider,
    base_url: patch.base_url,
    api_token: patch.api_token,
  });

  const existing = isRecord(ai.embed) ? ai.embed : {};
  ai.embed = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : boolOr(existing.enabled, false),
    provider: patch.provider,
    model: typeof patch.model === 'string' && patch.model.trim()
      ? patch.model
      : strOr(existing.model, DEFAULT_EMBED_MODEL),
  };

  return next;
}
