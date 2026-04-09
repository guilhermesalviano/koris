import 'dotenv/config';

// Check if running in test environment
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export const config = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENVIRONMENT: process.env.ENVIRONMENT || 'development',
  BASE_DIR: process.cwd(),
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  OLLAMA: {
    BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    MODEL: process.env.OLLAMA_MODEL || 'gemma4:e2b',
  },
} as const;

// Only validate token in production/development, not in tests or TUI mode
const isTui = process.argv.includes('tui') || process.argv.includes('--tui');
if (!isTest && !isTui && !config.TELEGRAM.BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  console.error('Please set TELEGRAM_BOT_TOKEN in your .env file or environment variables');
  process.exit(1);
}
