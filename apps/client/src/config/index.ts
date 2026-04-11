import 'dotenv/config';

// Check if running in test environment
const isTest = process.env.NODE_ENV === 'test';

export const config = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENVIRONMENT: process.env.ENVIRONMENT || 'development',
  PORT: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  BASE_DIR: process.cwd(),
  AI: {
    // In tests we default to a deterministic mock provider so unit tests don't require Ollama.
    PROVIDER: (process.env.VITEST === 'true' ? 'mock' : process.env.AI_PROVIDER || 'ollama'),
    BASE_URL: process.env.AI_BASE_URL || 'http://localhost:11434',
    MODEL: process.env.AI_MODEL || 'gemma4:e2b',
  },
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  },
} as const;

// Only validate token when Telegram mode is explicitly requested.
const isTelegramMode = process.argv.includes('telegram') || process.argv.includes('--telegram');
if (!isTest && isTelegramMode && !config.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  console.error('Please set TELEGRAM_BOT_TOKEN in your .env file or environment variables');
  process.exit(1);
}
