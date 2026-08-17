import 'dotenv/config';
import { deepGet, getConfigValue, loadConfigFile } from './helpers';

const isTest = process.env.NODE_ENV === 'test';

const fileConfig = loadConfigFile({
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

export const config = {
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
    TIMEOUTS: {
      IDLE_MS:   Number(get('ai.timeouts.idle_ms', String(6 * 60_000))),
      HARD_MS:   Number(get('ai.timeouts.hard_ms', String(20 * 60_000))),
      HEALTH_MS: Number(get('ai.timeouts.health_ms', String(5_000))),
    },
    SUMMARIZER: get('ai.summarizer', 'true') === 'true',
    PROMPT_SANITIZER: get('ai.prompt_sanitizer', 'false') === 'true',
  },
  CHANNELS: {
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
  PERSONAL_INFORMATION: getPersonalInformation(),
} as const;

const isTelegramMode = process.argv.includes('telegram') || process.argv.includes('--telegram');
if (!isTest && isTelegramMode && !config.CHANNELS.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: channels.telegram.bot_token is required');
  console.error('Please set channels.telegram.bot_token in settings.json or CHANNELS_TELEGRAM_BOT_TOKEN as an environment variable');
  process.exit(1);
}
