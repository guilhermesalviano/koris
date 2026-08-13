/**
 * Settings validation script.
 *
 * Checks settings.json (and env vars) for correctness before starting the app.
 *
 * Usage:
 *   pnpm --filter koris-agent validate
 *   tsx src/validate-settings.ts
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { config } from './config';
import { resolveConfigPaths, loadConfigFile } from './config/helpers';

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

function pass(label: string, detail = '') {
  console.log(`  ${c.green}✔${c.reset} ${label}${detail ? c.gray + '  ' + detail + c.reset : ''}`);
}

function fail(label: string, hint = '') {
  console.log(`  ${c.red}✖${c.reset} ${c.bold}${label}${c.reset}${hint ? '\n    ' + c.yellow + hint + c.reset : ''}`);
}

function warn(label: string, hint = '') {
  console.log(`  ${c.yellow}⚠${c.reset} ${label}${hint ? c.gray + '  (' + hint + ')' + c.reset : ''}`);
}

function section(title: string) {
  console.log(`\n${c.cyan}${c.bold}▸ ${title}${c.reset}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}

function isValidDateYYYYMMDD(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function httpGet(url: string, timeoutMs = 5000, headers?: Record<string, string>): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Validation counters ───────────────────────────────────────────────────────
let errors = 0;
let warnings = 0;

function check(ok: boolean, label: string, errorHint: string, detail = '') {
  if (ok) { pass(label, detail); } else { fail(label, errorHint); errors++; }
}

function advisory(ok: boolean, label: string, hint = '', detail = '') {
  if (ok) { pass(label, detail); } else { warn(label, hint); warnings++; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}koris-agent — settings validation${c.reset}`);

  // ── 1. settings.json file ────────────────────────────────────────────────
  section('settings.json');
  const candidatePaths = resolveConfigPaths(process.cwd(), __dirname);
  const foundPath = candidatePaths.find(existsSync);

  if (foundPath) {
    pass('File found', foundPath);
    // Validate JSON parseable
    const parsed = loadConfigFile({ cwd: process.cwd(), dirname: __dirname, onParseError: (msg) => { fail('JSON parse error', msg); errors++; } });
    if (Object.keys(parsed).length > 0 || foundPath) {
      pass('Valid JSON');
    }
  } else {
    warn('settings.json not found — using defaults and env vars only', 'create apps/client/settings.json to configure the app');
    warnings++;
  }

  // ── 2. General settings ──────────────────────────────────────────────────
  section('General');

  check(
    Number.isInteger(config.WEB_PORT) && config.WEB_PORT > 0 && config.WEB_PORT <= 65535,
    'web_port is a valid port number',
    `Got: ${config.WEB_PORT}. Must be an integer between 1 and 65535.`,
    String(config.WEB_PORT),
  );

  advisory(
    isValidUrl(config.GATEWAY_HOST),
    'gateway_host is a valid URL',
    'Set gateway_host in settings.json to the public URL of this server',
    config.GATEWAY_HOST,
  );

  advisory(
    config.ALLOWED_DOMAINS.length > 0,
    'allowed_domains is configured',
    'Add allowed_domains to settings.json to permit curl_request (default-deny)',
    config.ALLOWED_DOMAINS.join(', '),
  );

  const validLogLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  check(
    validLogLevels.includes(config.LOG_LEVEL),
    'log.level is valid',
    `Got: "${config.LOG_LEVEL}". Must be one of: ${validLogLevels.join(', ')}.`,
    config.LOG_LEVEL,
  );

  check(
    config.HEARTBEAT.INTERVAL_MS > 0,
    'heartbeat.interval_ms is positive',
    `Got: ${config.HEARTBEAT.INTERVAL_MS}`,
    `${config.HEARTBEAT.INTERVAL_MS} ms`,
  );

  // ── 3. AI Provider ───────────────────────────────────────────────────────
  section('AI Provider');

  const supportedProviders = ['ollama', 'nvidia', 'mock'];

  check(
    supportedProviders.includes(config.AI.MANAGER.PROVIDER),
    'ai.manager.provider is supported',
    `Got: "${config.AI.MANAGER.PROVIDER}". Supported: ${supportedProviders.join(', ')}.`,
    config.AI.MANAGER.PROVIDER,
  );

  check(
    isValidUrl(config.AI.MANAGER.BASE_URL),
    'ai.manager.base_url is a valid URL',
    `Got: "${config.AI.MANAGER.BASE_URL}"`,
    config.AI.MANAGER.BASE_URL,
  );

  check(
    config.AI.MANAGER.MODEL.trim().length > 0,
    'ai.manager.model is not empty',
    'Set ai.manager.model in settings.json',
    config.AI.MANAGER.MODEL,
  );

  check(
    supportedProviders.includes(config.AI.WORKERS.PROVIDER),
    'ai.workers.provider is supported',
    `Got: "${config.AI.WORKERS.PROVIDER}". Supported: ${supportedProviders.join(', ')}.`,
    config.AI.WORKERS.PROVIDER,
  );

  check(
    isValidUrl(config.AI.WORKERS.BASE_URL),
    'ai.workers.base_url is a valid URL',
    `Got: "${config.AI.WORKERS.BASE_URL}"`,
    config.AI.WORKERS.BASE_URL,
  );

  check(
    config.AI.WORKERS.MODEL.trim().length > 0,
    'ai.workers.model is not empty',
    'Set ai.workers.model in settings.json',
    config.AI.WORKERS.MODEL,
  );

  check(
    config.AI.TIMEOUTS.IDLE_MS > 0,
    'ai.timeouts.idle_ms is positive',
    `Got: ${config.AI.TIMEOUTS.IDLE_MS}`,
    `${config.AI.TIMEOUTS.IDLE_MS} ms`,
  );

  check(
    config.AI.TIMEOUTS.HARD_MS > config.AI.TIMEOUTS.IDLE_MS,
    'ai.timeouts.hard_ms > idle_ms',
    `hard_ms (${config.AI.TIMEOUTS.HARD_MS}) must be greater than idle_ms (${config.AI.TIMEOUTS.IDLE_MS})`,
  );

  advisory(
    config.AI.SEARCH_API_KEY.trim().length > 0,
    'ai.search_api_key is set',
    'Required for web search tool',
  );

  // Connectivity check (skipped for mock)
  const profiles = [
    { label: 'manager', provider: config.AI.MANAGER.PROVIDER, baseUrl: config.AI.MANAGER.BASE_URL, apiToken: config.AI.MANAGER.API_TOKEN },
    { label: 'workers', provider: config.AI.WORKERS.PROVIDER, baseUrl: config.AI.WORKERS.BASE_URL, apiToken: config.AI.WORKERS.API_TOKEN },
  ];

  for (const profile of profiles) {
    if (profile.provider === 'mock') {
      pass(`AI provider connectivity check (${profile.label})`, 'skipped (provider=mock)');
      continue;
    }

    process.stdout.write(`  ${c.gray}⟳ Checking ${profile.label} AI provider connectivity …${c.reset}\r`);
    const healthUrl = profile.provider === 'ollama'
      ? `${profile.baseUrl.replace(/\/+$/, '')}/api/version`
      : `${profile.baseUrl.replace(/\/+$/, '')}/models`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (profile.provider === 'nvidia' && profile.apiToken) headers['Authorization'] = `Bearer ${profile.apiToken}`;
    const result = await httpGet(healthUrl, config.AI.TIMEOUTS.HEALTH_MS, headers);

    if (result.ok) {
      let detail = '';
      if (profile.provider === 'ollama') {
        try { detail = (JSON.parse(result.body ?? '{}') as { version?: string }).version ?? ''; } catch { /* ignore */ }
      }
      pass(`AI provider reachable (${profile.label})`, detail ? `v${detail}` : healthUrl);
    } else if (result.error) {
      warn(`AI provider unreachable (${profile.label})`, result.error);
      warnings++;
    } else if (result.status === 401 || result.status === 403) {
      fail(`AI provider auth failed (${profile.label})`, `HTTP ${result.status} — check ai.${profile.label}.api_token in settings.json`);
      errors++;
    } else {
      warn(`AI provider unreachable (${profile.label})`, `HTTP ${result.status} from ${healthUrl}`);
      warnings++;
    }
  }

  // ── 4. Channels ──────────────────────────────────────────────────────────
  section('Channels › Telegram');

  if (config.CHANNELS.TELEGRAM.ENABLED) {
    check(
      config.CHANNELS.TELEGRAM.BOT_TOKEN.trim().length > 0,
      'channels.telegram.bot_token is set',
      'Set channels.telegram.bot_token in settings.json',
    );

    if (config.CHANNELS.TELEGRAM.BOT_TOKEN.trim().length > 0) {
      // Telegram bot tokens follow the pattern <numeric_id>:<alphanumeric>
      const tokenPattern = /^\d+:[A-Za-z0-9_-]{35,}$/;
      advisory(
        tokenPattern.test(config.CHANNELS.TELEGRAM.BOT_TOKEN.trim()),
        'channels.telegram.bot_token format looks valid',
        'Expected format: <numeric_id>:<35+ alphanumeric chars>',
      );

      process.stdout.write(`  ${c.gray}⟳ Verifying Telegram bot token …${c.reset}\r`);
      const tgResult = await httpGet(
        `https://api.telegram.org/bot${config.CHANNELS.TELEGRAM.BOT_TOKEN.trim()}/getMe`,
        8000,
      );
      if (tgResult.ok) {
        try {
          const data = JSON.parse(tgResult.body ?? '{}') as { ok?: boolean; result?: { username?: string } };
          if (data.ok === false) {
            fail('Telegram bot token is invalid', 'Telegram API rejected the token — generate a new one with @BotFather');
            errors++;
          } else {
            pass('Telegram bot token is valid', `@${data.result?.username ?? '?'}`);
          }
        } catch {
          pass('Telegram bot token is valid');
        }
      } else if (tgResult.error) {
        // Network/connection failure — cannot reach Telegram API; treat as a warning
        warn('Could not reach Telegram API to verify token', tgResult.error);
        warnings++;
      } else {
        // Got an HTTP error response (e.g. 401/404) — token is explicitly rejected
        fail('Telegram bot token is invalid', `HTTP ${tgResult.status} from Telegram API — token may be invalid or revoked`);
        errors++;
      }
    }

    advisory(
      config.CHANNELS.TELEGRAM.CHAT_ID.trim().length > 0,
      'channels.telegram.chat_id is set',
      'Set channels.telegram.chat_id to restrict to a specific chat',
    );
  } else {
    pass('Telegram channel', 'disabled — skipping');
  }

  // ── 5. Personal information ──────────────────────────────────────────────
  section('Personal Information');

  advisory(
    config.PERSONAL_INFORMATION.NAME.trim().length > 0,
    'personal_information.name is set',
    'Used in system prompts — recommended',
  );

  advisory(
    config.PERSONAL_INFORMATION.OCCUPATION.trim().length > 0,
    'personal_information.occupation is set',
    'Used in system prompts — recommended',
  );

  if (config.PERSONAL_INFORMATION.BIRTHDAY.trim().length > 0) {
    check(
      isValidDateYYYYMMDD(config.PERSONAL_INFORMATION.BIRTHDAY),
      'personal_information.birthday is YYYY-MM-DD',
      `Got: "${config.PERSONAL_INFORMATION.BIRTHDAY}"`,
      config.PERSONAL_INFORMATION.BIRTHDAY,
    );
  } else {
    pass('personal_information.birthday', 'not set');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  if (errors === 0 && warnings === 0) {
    console.log(`${c.green}${c.bold}✔ All checks passed.${c.reset}\n`);
    process.exit(0);
  } else if (errors === 0) {
    console.log(`${c.yellow}${c.bold}⚠ Passed with ${warnings} warning(s).${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.red}${c.bold}✖ ${errors} error(s), ${warnings} warning(s). Fix the issues above before starting the app.${c.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Unexpected error during validation:${c.reset}`, err);
  process.exit(1);
});
