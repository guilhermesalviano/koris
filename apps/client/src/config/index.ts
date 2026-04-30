import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const isTest = process.env.NODE_ENV === 'test';

function loadConfigFile(): Record<string, unknown> {
  const configPath = join(process.cwd(), 'settings.json');
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.warn('Warning: Failed to parse settings.json, ignoring file.');
    return {};
  }
}

const fileConfig = loadConfigFile();

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function get(attr: string, fallback: string): string {
  return (
    (deepGet(fileConfig, attr) as string | undefined) ??
    fallback
  );
}

export const config = {
  LOG_LEVEL:   get('log.LEVEL',   'info'),
  TIMEZONE:    get('TIMEZONE',    'AMERICA/Sao_Paulo'),
  ENVIRONMENT: get('ENVIRONMENT', 'development'),
  PORT:        Number(get('PORT', '3000')),
  GMAIL: {
    GATEWAY_HOST: get('gmail.GATEWAY_HOST', 'http://localhost:3000'),
  },
  BASE_DIR:    process.cwd(),
  TEMP_FOLDER: get('TEMP_FOLDER', './temp'),
  HEARTBEAT: {
    ENABLED: get('heartbeat.ENABLED', 'true') === 'true',
    INTERVAL_MS: Number(get('heartbeat.INTERVAL_MS', (30 * 60 * 1000).toString())), // Default to 30 minutes
    ACTIVE_HOURS: {
      START: get('heartbeat.ACTIVE_HOURS.START', '08:00'),
      END: get('heartbeat.ACTIVE_HOURS.END', '22:00'),
    },
  },
  AI: {
    PROVIDER: process.env.VITEST === 'true'
      ? 'mock'
      : get('ai.PROVIDER', 'ollama'),
    BASE_URL:  get('ai.BASE_URL',  'http://localhost:11434'),
    ALLOW_REMOTE_BASE_URL: get('ai.ALLOW_REMOTE_BASE_URL', 'false') === 'true',
    API_TOKEN: get('ai.API_TOKEN', ''),
    MODEL:     get('ai.MODEL',     'gemma4:e2b'),
  },
  TELEGRAM: {
    BOT_TOKEN:   get('telegram.BOT_TOKEN',   ''),
    WEBHOOK_URL: get('telegram.WEBHOOK_URL', ''),
    USE_POLLING: get('telegram.USE_POLLING', 'true') === 'true',
  },
} as const;

const isTelegramMode = process.argv.includes('telegram') || process.argv.includes('--telegram');
if (!isTest && isTelegramMode && !config.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  console.error('Please set TELEGRAM_BOT_TOKEN in settings.json or as an environment variable');
  process.exit(1);
}