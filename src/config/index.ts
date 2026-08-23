import 'dotenv/config';
import { deepGet, getConfigValue, loadConfigFile } from './helpers';

const isTest = process.env.NODE_ENV === 'test';

let fileConfig = loadConfigFile({
  onParseError: (message) => console.warn(message),
});

function get(path: string, fallback: string): string {
  return getConfigValue(path, fallback, fileConfig);
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
    TTL_MS: number;
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
      EMBEDDING_ENABLED: boolean;
      EMBED_MODEL: string;
      NUM_CTX: number;
    };
    SEARCH_API_KEY: string;
    SEARXNG_URL: string;
    TIMEOUTS: {
      IDLE_MS: number;
      HARD_MS: number;
      HEALTH_MS: number;
    };
    SUMMARIZER: boolean;
    PROMPT_SANITIZER: boolean;
  };
  CHANNELS: {
    ALLOW_UNTRUSTED: boolean;
    TELEGRAM: {
      ENABLED: boolean;
      BOT_TOKEN: string;
      WHITELIST: string;
    };
    WHATSAPP: {
      ENABLED: boolean;
      AUTH_FOLDER: string;
      WHITELIST: string;
      MENTION_ID: string;
    };
  };
  GITHUB: {
    TOKEN: string;
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
    TTL_MS: Number(get('session.ttl_ms', String(30 * 60 * 1000))),
  },
  HEARTBEAT: get('heartbeat', 'true') === 'true',
  AI: {
    PARALLEL: get('ai.parallel', 'true') === 'true',
    SUBAGENTS_PARALLEL: get('ai.subagents_parallel', 'false') === 'true',
    BACKGROUND_GRACE_MS: Number(get('ai.background_grace_ms', '5000')),
    MANAGER: {
      PROVIDER: process.env.VITEST === 'true' ? 'mock' : get('ai.manager.provider', 'ollama'),
      BASE_URL: get('ai.manager.base_url', 'http://localhost:11434'),
      API_TOKEN: get('ai.manager.api_token', ''),
      MODEL:   get('ai.manager.model', 'gemma4:e2b'),
    },
    WORKERS: {
      PROVIDER: process.env.VITEST === 'true' ? 'mock' : get('ai.workers.provider', 'ollama'),
      BASE_URL: get('ai.workers.base_url', 'http://localhost:11434'),
      API_TOKEN: get('ai.workers.api_token', ''),
      MODEL:   get('ai.workers.model', 'qwen:3.5:2b'),
      EMBEDDING_ENABLED: get('ai.workers.embedding', 'false') === 'true',
      EMBED_MODEL: get('ai.workers.embed_model', 'nomic-embed-text'),
      NUM_CTX: Number(get('ai.workers.num_ctx', '16384')),
    },
    SEARCH_API_KEY: get('ai.search_api_key', ''),
    SEARXNG_URL: get('ai.searxng_url', ''),
    TIMEOUTS: {
      IDLE_MS:   Number(get('ai.timeouts.idle_ms', String(6 * 60_000))),
      HARD_MS:   Number(get('ai.timeouts.hard_ms', String(20 * 60_000))),
      HEALTH_MS: Number(get('ai.timeouts.health_ms', String(5_000))),
    },
    SUMMARIZER: get('ai.summarizer', 'true') === 'true',
    PROMPT_SANITIZER: get('ai.prompt_sanitizer', 'false') === 'true',
  },
  CHANNELS: {
    ALLOW_UNTRUSTED: get('channels.allow_untrusted', 'false') === 'true',
    TELEGRAM: {
      ENABLED:    get('channels.telegram.enabled', 'false') === 'true',
      BOT_TOKEN:  get('channels.telegram.bot_token', ''),
      WHITELIST:  get('channels.telegram.whitelist', ''),
    },
    WHATSAPP: {
      ENABLED:     get('channels.whatsapp.enabled', 'false') === 'true',
      AUTH_FOLDER: get('channels.whatsapp.auth_folder', './.whatsapp_auth'),
      WHITELIST:   get('channels.whatsapp.whitelist', ''),
      MENTION_ID:  get('channels.whatsapp.mention_id', ''),
    },
  },
  GITHUB: {
    TOKEN: get('github.token', ''),
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

const isTelegramMode = process.argv.includes('telegram') || process.argv.includes('--telegram');
if (!isTest && isTelegramMode && !config.CHANNELS.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: channels.telegram.bot_token is required');
  console.error('Please set channels.telegram.bot_token in koris.json or CHANNELS_TELEGRAM_BOT_TOKEN as an environment variable');
  process.exit(1);
}
