import 'dotenv/config';
import { deepGet, getConfigValue, loadConfigFile } from './helpers';
import { resolveAiRoles } from './ai-config';

let fileConfig = loadConfigFile({
  onParseError: (message) => console.warn(message),
});

function get(path: string, fallback: string): string {
  return getConfigValue(path, fallback, fileConfig);
}

/**
 * Like `get`, but only consults the env-var override for `path` (via toEnvKey)
 * and otherwise returns `value` unchanged. Used for the AI role fields, which
 * are resolved from `ai.providers[]` / `ai.roles` rather than a fixed path.
 */
function envOr(path: string, value: string): string {
  return getConfigValue(path, value, {});
}

function getPersonalInformation(): Record<string, string> {
  const raw = deepGet(fileConfig, 'personal_information');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = String(value);
    }
    return acc;
  }, {});
}

export type SummarizerMode = 'auto' | 'manual';

export interface AppConfig {
  LOG_LEVEL: string;
  TIMEZONE: string;
  ENVIRONMENT: string;
  WEB_PORT: number;
  BASE_DIR: string;
  GATEWAY_HOST: string;
  ALLOWED_DOMAINS: string[];
  LEARNED_SKILLS_LIMIT: number;
  STICKERS: {
    ENABLED: boolean;
    ALLOW_UNTRUSTED: boolean;
  };
  SESSION: {
    /** Sessions auto-rotate once idle past this long, regardless of mode. */
    TTL_MS: number;
    /**
     * 'auto': the per-turn summarizer runs after every reply, distilling
     * each exchange into a memory as it happens.
     * 'manual': the per-turn summarizer is off — the `/compact` command is
     * the sole way a session gets summarized (and rotated on demand).
     */
    SUMMARIZER_MODE: SummarizerMode;
  };
  HEARTBEAT: boolean;
  AI: {
    PARALLEL: boolean;
    SUBAGENTS_PARALLEL: boolean;
    BACKGROUND_GRACE_MS: number;
    MANAGER: {
      PROVIDER: string;
      BASE_URL: string;
      API_TOKEN: string;
      MODEL: string;
    };
    WORKERS: {
      PROVIDER: string;
      BASE_URL: string;
      API_TOKEN: string;
      MODEL: string;
      NUM_CTX: number;
    };
    EMBED: {
      ENABLED: boolean;
      PROVIDER: string;
      BASE_URL: string;
      API_TOKEN: string;
      MODEL: string;
    };
    SEARCH_API_KEY: string;
    SEARXNG_URL: string;
    TIMEOUTS: {
      IDLE_MS: number;
      HARD_MS: number;
      HEALTH_MS: number;
    };
    PROMPT_SANITIZER: boolean;
  };
  CHANNELS: {
    ALLOW_UNTRUSTED: boolean;
  };
  GITHUB: {
    TOKEN: string;
    OWNER: string;
  };
  PERSONAL_INFORMATION: Record<string, string>;
}

function buildConfig(): AppConfig {
  return {
  LOG_LEVEL:   get('log_level', 'info'),
  TIMEZONE:    get('timezone', 'America/Sao_Paulo'),
  ENVIRONMENT: get('environment', 'development'),
  WEB_PORT:    Number(get('web_port', '3000')),
  BASE_DIR:    process.cwd(),
  GATEWAY_HOST: get('gateway_host', 'http://localhost:3000'),
  ALLOWED_DOMAINS: get('allowed_domains', '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  LEARNED_SKILLS_LIMIT: Number(get('learned_skills_limit', '10')),
  STICKERS: {
    ENABLED: get('stickers.enabled', 'true') === 'true',
    // Temporary: lets senders outside the channel whitelist learn/send stickers
    // while the rest of the toolset stays locked to trusted senders.
    ALLOW_UNTRUSTED: get('stickers.allow_untrusted', 'true') === 'true',
  },
  SESSION: {
    TTL_MS: Number(get('session.ttl_ms', String(3 * 60 * 60 * 1000))),
    SUMMARIZER_MODE: get('session.summarizer_mode', 'auto') === 'manual' ? 'manual' : 'auto',
  },
  HEARTBEAT: get('heartbeat', 'true') === 'true',
  AI: (() => {
    // Resolve manager/workers from the `ai.providers[]` + `ai.roles` shape
    // (legacy `ai.manager` / `ai.workers` is auto-migrated by resolveAiRoles),
    // then layer the documented env-var overrides on top of each field.
    const roles = resolveAiRoles(deepGet(fileConfig, 'ai') ?? {});
    return {
    PARALLEL: get('ai.parallel', 'true') === 'true',
    SUBAGENTS_PARALLEL: get('ai.subagents_parallel', 'false') === 'true',
    BACKGROUND_GRACE_MS: Number(get('ai.background_grace_ms', '5000')),
    MANAGER: {
      PROVIDER: process.env.VITEST === 'true' ? 'mock' : envOr('ai.manager.provider', roles.MANAGER.PROVIDER),
      BASE_URL: envOr('ai.manager.base_url', roles.MANAGER.BASE_URL),
      API_TOKEN: envOr('ai.manager.api_token', roles.MANAGER.API_TOKEN),
      MODEL:   envOr('ai.manager.model', roles.MANAGER.MODEL),
    },
    WORKERS: {
      PROVIDER: process.env.VITEST === 'true' ? 'mock' : envOr('ai.workers.provider', roles.WORKERS.PROVIDER),
      BASE_URL: envOr('ai.workers.base_url', roles.WORKERS.BASE_URL),
      API_TOKEN: envOr('ai.workers.api_token', roles.WORKERS.API_TOKEN),
      MODEL:   envOr('ai.workers.model', roles.WORKERS.MODEL),
      // num_ctx is resolved from the workers provider entry. Env overrides apply.
      NUM_CTX: Number(envOr('ai.workers.num_ctx', String(roles.WORKERS.NUM_CTX))),
    },
    EMBED: {
      // Embeddings have their own pointer (`ai.embed`), resolved to
      // base_url/api_token from the matching ai.providers[] entry.
      ENABLED: envOr('ai.embed.enabled', String(roles.EMBED.ENABLED)) === 'true',
      PROVIDER: process.env.VITEST === 'true' ? 'mock' : envOr('ai.embed.provider', roles.EMBED.PROVIDER),
      BASE_URL: envOr('ai.embed.base_url', roles.EMBED.BASE_URL),
      API_TOKEN: envOr('ai.embed.api_token', roles.EMBED.API_TOKEN),
      MODEL: envOr('ai.embed.model', roles.EMBED.MODEL),
    },
    SEARCH_API_KEY: get('ai.search_api_key', ''),
    SEARXNG_URL: get('ai.searxng_url', ''),
    TIMEOUTS: {
      IDLE_MS:   Number(get('ai.timeouts.idle_ms', String(6 * 60_000))),
      HARD_MS:   Number(get('ai.timeouts.hard_ms', String(20 * 60_000))),
      HEALTH_MS: Number(get('ai.timeouts.health_ms', String(5_000))),
    },
    PROMPT_SANITIZER: get('ai.prompt_sanitizer', 'false') === 'true',
    };
  })(),
  CHANNELS: {
    ALLOW_UNTRUSTED: get('channels.allow_untrusted', 'false') === 'true',
  },
  GITHUB: {
    TOKEN: get('github.token', ''),
    OWNER: get('github.owner', ''),
  },
  PERSONAL_INFORMATION: getPersonalInformation(),
  };
}

export const config: AppConfig = buildConfig();

/**
 * Re-reads koris.json (and env vars) and applies the new values onto the
 * existing `config` object in place, so already-imported references stay
 * valid. Note this is a shallow merge: nested objects (config.AI,
 * config.CHANNELS, ...) are replaced wholesale with new references — code
 * must not cache a nested object across a reload.
 */
export function reloadConfig(options?: { cwd?: string; dirname?: string }): void {
  fileConfig = loadConfigFile({
    cwd: options?.cwd,
    dirname: options?.dirname,
    onParseError: (message) => console.warn(message),
  });
  Object.assign(config, buildConfig());
}
