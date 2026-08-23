/**
 * Settings validation script.
 *
 * Checks koris.json (and env vars) for correctness before starting the app.
 *
 * Usage:
 *   pnpm validate
 *   tsx src/validate-settings.ts
 */

import 'dotenv/config';
import { existsSync } from 'fs';
import { config } from './config';
import { resolveConfigPaths, loadConfigFile } from './config/helpers';
import {
  VALID_LOG_LEVELS,
  isValidUrl,
  isValidLogLevel,
  isValidTelegramTokenFormat,
  isSupportedProvider,
  checkAiProviderConnectivity,
  checkTelegramToken,
} from './config/validators';

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
  console.log(`\n${c.bold}koris — settings validation${c.reset}`);

  // ── 1. koris.json file ────────────────────────────────────────────────
  section('koris.json');
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
    warn('koris.json not found — using defaults and env vars only', 'create apps/client/koris.json to configure the app');
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
    'Set gateway_host in koris.json to the public URL of this server',
    config.GATEWAY_HOST,
  );

  advisory(
    config.ALLOWED_DOMAINS.length > 0,
    'allowed_domains is configured',
    'Add allowed_domains to koris.json to permit curl_request (default-deny)',
    config.ALLOWED_DOMAINS.join(', '),
  );

  check(
    isValidLogLevel(config.LOG_LEVEL),
    'log_level is valid',
    `Got: "${config.LOG_LEVEL}". Must be one of: ${VALID_LOG_LEVELS.join(', ')}.`,
    config.LOG_LEVEL,
  );

  advisory(
    !config.STICKERS.ALLOW_UNTRUSTED,
    'stickers.allow_untrusted is valid',
    'but stickers.allow_untrusted is on — anyone outside the channel whitelist can learn/send stickers',
  );

  // ── 3. AI Provider ───────────────────────────────────────────────────────
  section('AI Provider');

  check(
    typeof config.AI.PARALLEL === 'boolean',
    'ai.parallel is valid',
    'Set ai.parallel to true or false in koris.json',
    String(config.AI.PARALLEL),
  );

  check(
    typeof config.AI.SUBAGENTS_PARALLEL === 'boolean',
    'ai.subagents_parallel is valid',
    'Set ai.subagents_parallel to true or false in koris.json',
    String(config.AI.SUBAGENTS_PARALLEL),
  );

  check(
    Number.isInteger(config.AI.BACKGROUND_GRACE_MS) && config.AI.BACKGROUND_GRACE_MS >= 0,
    'ai.background_grace_ms is valid',
    'Set ai.background_grace_ms to a non-negative integer in koris.json',
    String(config.AI.BACKGROUND_GRACE_MS),
  );

  const supportedProvidersLabel = 'Supported providers depend on the current build';

  check(
    isSupportedProvider(config.AI.MANAGER.PROVIDER),
    'ai.manager.provider is supported',
    `Got: "${config.AI.MANAGER.PROVIDER}". ${supportedProvidersLabel}.`,
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
    'Set ai.manager.model in koris.json',
    config.AI.MANAGER.MODEL,
  );

  check(
    isSupportedProvider(config.AI.WORKERS.PROVIDER),
    'ai.workers.provider is supported',
    `Got: "${config.AI.WORKERS.PROVIDER}". ${supportedProvidersLabel}.`,
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
    'Set ai.workers.model in koris.json',
    config.AI.WORKERS.MODEL,
  );

  check(
    Number.isInteger(config.AI.WORKERS.NUM_CTX) && config.AI.WORKERS.NUM_CTX >= 512 && config.AI.WORKERS.NUM_CTX <= 131072,
    'ai.workers.num_ctx is a valid context size',
    `Got: ${config.AI.WORKERS.NUM_CTX}. Expected an integer between 512 and 131072.`,
    `${config.AI.WORKERS.NUM_CTX} tokens`,
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
    config.AI.SEARXNG_URL.trim().length > 0,
    'ai.searxng_url is set',
    'Required for web search tool',
  );

  advisory(
    config.AI.SEARCH_API_KEY.trim().length > 0,
    'ai.search_api_key is set',
    'Only used if the SerpAPI fallback is enabled in code (currently inactivated)',
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
    const result = await checkAiProviderConnectivity(
      { label: profile.label, provider: profile.provider, baseUrl: profile.baseUrl, apiToken: profile.apiToken },
      config.AI.TIMEOUTS.HEALTH_MS,
    );

    if (result.ok) {
      pass(`AI provider reachable (${profile.label})`, result.detail ? `v${result.detail}` : result.healthUrl);
    } else if (result.authFailed) {
      fail(`AI provider auth failed (${profile.label})`, `HTTP ${result.status} — check ai.${profile.label}.api_token in koris.json`);
      errors++;
    } else if (result.error) {
      warn(`AI provider unreachable (${profile.label})`, result.error);
      warnings++;
    } else {
      warn(`AI provider unreachable (${profile.label})`, `HTTP ${result.status} from ${result.healthUrl}`);
      warnings++;
    }
  }

  // ── 4. Channels ──────────────────────────────────────────────────────────
  section('Channels › Telegram');

  if (config.CHANNELS.TELEGRAM.ENABLED) {
    check(
      config.CHANNELS.TELEGRAM.BOT_TOKEN.trim().length > 0,
      'channels.telegram.bot_token is set',
      'Set channels.telegram.bot_token in koris.json',
    );

    advisory(
      config.CHANNELS.TELEGRAM.WHITELIST.trim().length > 0 || config.CHANNELS.ALLOW_UNTRUSTED,
      'channels.telegram.whitelist is set (or channels.allow_untrusted is enabled)',
      config.CHANNELS.ALLOW_UNTRUSTED
        ? 'channels.telegram.whitelist is empty — anyone can chat with the bot (allow_untrusted is on)'
        : 'channels.telegram.whitelist is empty — no one can chat with the bot',
    );

    if (config.CHANNELS.TELEGRAM.BOT_TOKEN.trim().length > 0) {
      advisory(
        isValidTelegramTokenFormat(config.CHANNELS.TELEGRAM.BOT_TOKEN),
        'channels.telegram.bot_token format looks valid',
        'Expected format: <numeric_id>:<35+ alphanumeric chars>',
      );

      process.stdout.write(`  ${c.gray}⟳ Verifying Telegram bot token …${c.reset}\r`);
      const tgResult = await checkTelegramToken(config.CHANNELS.TELEGRAM.BOT_TOKEN);

      if (tgResult.ok) {
        pass('Telegram bot token is valid', tgResult.username ? `@${tgResult.username}` : undefined);
      } else if (tgResult.networkError) {
        warn('Could not reach Telegram API to verify token', tgResult.error);
        warnings++;
      } else {
        fail('Telegram bot token is invalid', tgResult.error ?? 'Telegram API rejected the token — generate a new one with @BotFather');
        errors++;
      }
    }
  } else {
    pass('Telegram channel', 'disabled — skipping');
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
