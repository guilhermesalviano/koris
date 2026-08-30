/**
 * AI provider config shape + resolution.
 *
 * `koris.json` keeps every configured provider in `ai.providers[]` (each with
 * its own credentials, context size, and an inner list of model names) and
 * points each role at one of them through `ai.roles`. Embeddings are a
 * single AI-wide setting, not per-role:
 *
 *   "ai": {
 *     "embedding": false,
 *     "embed_model": "nomic-embed-text",
 *     "providers": [
 *       { "provider": "ollama", "base_url": "…", "api_token": "", "num_ctx": 32768,
 *         "models": ["gemma4:e4b-it-q4_K_M", "qwen3.5:2b", "nomic-embed-text"] },
 *       { "provider": "openai", "base_url": "", "api_token": "sk-…", "num_ctx": 16384,
 *         "models": ["gpt-4o-mini"] }
 *     ],
 *     "roles": {
 *       "manager": { "provider": "ollama", "model": "gemma4:e4b-it-q4_K_M" },
 *       "workers": { "provider": "ollama", "model": "qwen3.5:2b" }
 *     }
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
  EMBEDDING_ENABLED: boolean;
  EMBED_MODEL: string;
  NUM_CTX: number;
}

export interface ResolvedAiRoles {
  MANAGER: ResolvedRoleProfile;
  WORKERS: ResolvedWorkersProfile;
}

export interface AiProviderPatch {
  provider: string;
  base_url?: string;
  api_token?: string;
  model?: string;
  /** Context window for this provider (stored on the provider entry). */
  num_ctx?: number;
}

export interface AiRolePatch extends AiProviderPatch {
  /** AI-wide embedding toggle / model (stored on `ai`, not the role). */
  embedding?: boolean;
  embed_model?: string;
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
  EMBEDDING_ENABLED: false,
  EMBED_MODEL: 'nomic-embed-text',
  NUM_CTX: 16384,
};

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
 * `providers[]` + `roles` shape, preserving every other `ai.*` key. The two
 * profiles collapse into one provider entry when they share a provider name +
 * base_url; the legacy per-role `num_ctx` moves onto that entry and
 * `embedding` / `embed_model` move to the AI-wide level.
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
      entry = { provider: name, base_url: baseUrl, api_token: strOr(profile.api_token, ''), models: [] };
      providers.push(entry);
    } else if (!strOr(entry.api_token, '') && typeof profile.api_token === 'string' && profile.api_token) {
      entry.api_token = profile.api_token;
    }
    if (profile.num_ctx !== undefined && entry.num_ctx === undefined) {
      entry.num_ctx = profile.num_ctx;
    }
    const models = entry.models as string[];
    for (const candidate of [profile.model, profile.embed_model]) {
      if (typeof candidate === 'string' && candidate.trim() && !models.includes(candidate)) {
        models.push(candidate);
      }
    }
  };
  upsert(manager);
  upsert(workers);

  const rest: Record<string, unknown> = { ...source };
  delete rest.manager;
  delete rest.workers;

  const normalized: Record<string, unknown> = {
    ...rest,
    providers,
    roles: {
      manager: {
        provider: strOr(manager.provider, DEFAULT_MANAGER.PROVIDER),
        model: strOr(manager.model, ''),
      },
      workers: {
        provider: strOr(workers.provider, DEFAULT_WORKERS.PROVIDER),
        model: strOr(workers.model, ''),
      },
    },
  };
  if (workers.embedding !== undefined) normalized.embedding = workers.embedding;
  if (workers.embed_model !== undefined) normalized.embed_model = workers.embed_model;
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
    MODEL: strOr(ptr.model, fallback.MODEL),
  };
}

/**
 * Resolves `config.AI.MANAGER` / `config.AI.WORKERS` from the raw `ai` block
 * of koris.json — new shape or legacy. Pure: no env access, that layering
 * stays in config/index.ts.
 */
export function resolveAiRoles(aiRaw: unknown): ResolvedAiRoles {
  const ai = hasLegacyAiShape(aiRaw) ? normalizeLegacyAi(aiRaw) : (isRecord(aiRaw) ? aiRaw : {});
  const providers = Array.isArray(ai.providers)
    ? (ai.providers as unknown[]).filter(isRecord)
    : [];
  const roles = isRecord(ai.roles) ? ai.roles : {};
  const workersPtr = isRecord(roles.workers) ? roles.workers : {};

  const manager = resolveRole(roles.manager, providers, DEFAULT_MANAGER);
  const workersBase = resolveRole(roles.workers, providers, DEFAULT_WORKERS);
  const workersEntry = findEntry(providers, workersBase.PROVIDER);

  return {
    MANAGER: manager,
    WORKERS: {
      ...workersBase,
      // AI-wide embedding settings, with a back-compat read of the old
      // per-role location so a not-yet-rewritten koris.json still works.
      EMBEDDING_ENABLED: boolOr(firstDefined(ai.embedding, workersPtr.embedding), DEFAULT_WORKERS.EMBEDDING_ENABLED),
      EMBED_MODEL: strOr(firstDefined(ai.embed_model, workersPtr.embed_model), DEFAULT_WORKERS.EMBED_MODEL),
      // Context size now lives on the provider entry (back-compat: old role field).
      NUM_CTX: numOr(firstDefined(workersEntry?.num_ctx, workersPtr.num_ctx), DEFAULT_WORKERS.NUM_CTX),
    },
  };
}

/**
 * Adds or updates a provider entry in `ai.providers[]` in place. Credentials
 * are only overwritten when the patch supplies a non-empty value (so a blank
 * token from the UI keeps the stored one); `num_ctx`, when given, is stored on
 * the entry; the model is appended to the entry's `models[]` if not already
 * listed. Mutates `ai`.
 */
export function upsertAiProvider(ai: Record<string, unknown>, patch: AiProviderPatch): void {
  const providers = Array.isArray(ai.providers)
    ? (ai.providers as Record<string, unknown>[])
    : [];
  ai.providers = providers;

  let entry = providers.find((p) => isRecord(p) && p.provider === patch.provider);
  if (!entry) {
    entry = { provider: patch.provider, base_url: '', api_token: '', models: [] };
    providers.push(entry);
  }
  if (typeof entry.base_url !== 'string') entry.base_url = '';
  if (typeof entry.api_token !== 'string') entry.api_token = '';

  if (typeof patch.base_url === 'string' && patch.base_url.trim()) {
    entry.base_url = patch.base_url;
  }
  if (typeof patch.api_token === 'string' && patch.api_token.trim()) {
    entry.api_token = patch.api_token;
  }
  if (typeof patch.num_ctx === 'number' && Number.isFinite(patch.num_ctx)) {
    entry.num_ctx = patch.num_ctx;
  }

  const models = Array.isArray(entry.models)
    ? (entry.models as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];
  if (typeof patch.model === 'string' && patch.model.trim() && !models.includes(patch.model)) {
    models.push(patch.model);
  }
  entry.models = models;
}

/**
 * Returns a copy of `base` with the given role repointed at `patch.provider` /
 * `patch.model`, the provider upserted into `ai.providers[]` (every other
 * provider left intact), AI-wide embedding settings updated when supplied, and
 * any legacy `ai.manager` / `ai.workers` blocks dropped. Used by the dashboard
 * `POST /settings` shim and onboarding.
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

  if (patch.embedding !== undefined) ai.embedding = patch.embedding;
  if (patch.embed_model !== undefined) ai.embed_model = patch.embed_model;

  const roles = getOrCreateRecord(ai, 'roles');
  const existing = isRecord(roles[role]) ? (roles[role] as Record<string, unknown>) : {};
  roles[role] = {
    provider: patch.provider,
    model: typeof patch.model === 'string' && patch.model.trim()
      ? patch.model
      : (typeof existing.model === 'string' ? existing.model : ''),
  };

  return next;
}
