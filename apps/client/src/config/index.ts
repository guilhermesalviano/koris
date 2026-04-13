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

function get(envKey: string, filePath: string, fallback: string): string {
  return (
    process.env[envKey] ??
    (deepGet(fileConfig, filePath) as string | undefined) ??
    fallback
  );
}

export const config = {
  LOG_LEVEL:   get('LOG_LEVEL',   'log.LEVEL',   'info'),
  ENVIRONMENT: get('ENVIRONMENT', 'ENVIRONMENT',  'development'),
  PORT:        Number(get('PORT', 'PORT',         '3000')),
  BASE_DIR:    process.cwd(),
  AI: {
    PROVIDER: process.env.VITEST === 'true'
      ? 'mock'
      : get('AI_PROVIDER', 'ai.PROVIDER', 'ollama'),
    BASE_URL:  get('AI_BASE_URL',  'ai.BASE_URL',  'http://localhost:11434'),
    API_TOKEN: get('AI_API_TOKEN', 'ai.API_TOKEN', ''),
    MODEL:     get('AI_MODEL',     'ai.MODEL',     'gemma4:e2b'),
  },
  TELEGRAM: {
    BOT_TOKEN:   get('TELEGRAM_BOT_TOKEN',   'telegram.BOT_TOKEN',   ''),
    WEBHOOK_URL: get('TELEGRAM_WEBHOOK_URL', 'telegram.WEBHOOK_URL', ''),
    USE_POLLING: get('TELEGRAM_USE_POLLING', 'telegram.USE_POLLING', 'true') === 'true',
  },
} as const;

const isTelegramMode = process.argv.includes('telegram') || process.argv.includes('--telegram');
if (!isTest && isTelegramMode && !config.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  console.error('Please set TELEGRAM_BOT_TOKEN in settings.json or as an environment variable');
  process.exit(1);
}