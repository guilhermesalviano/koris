import { getSupportedProviders } from '../services/providers';

export const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const;
export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

const TELEGRAM_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;

export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidLogLevel(value: string): value is LogLevel {
  return (VALID_LOG_LEVELS as readonly string[]).includes(value);
}

export function isValidTelegramTokenFormat(value: string): boolean {
  return TELEGRAM_TOKEN_PATTERN.test(value.trim());
}

export function isSupportedProvider(value: string): boolean {
  return (getSupportedProviders() as readonly string[]).includes(value);
}

export interface HttpGetResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

export async function httpGet(
  url: string,
  timeoutMs = 5000,
  headers?: Record<string, string>,
): Promise<HttpGetResult> {
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

export interface AiProviderConnectivityProfile {
  label: string;
  provider: string;
  baseUrl: string;
  apiToken: string;
}

export interface AiProviderConnectivityResult {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  error?: string;
  authFailed?: boolean;
  status?: number;
  healthUrl?: string;
}

export async function checkAiProviderConnectivity(
  profile: AiProviderConnectivityProfile,
  timeoutMs = 5000,
): Promise<AiProviderConnectivityResult> {
  if (profile.provider === 'mock') {
    return { ok: true, skipped: true };
  }

  const healthUrl = profile.provider === 'ollama'
    ? `${profile.baseUrl.replace(/\/+$/, '')}/api/version`
    : `${profile.baseUrl.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (profile.provider === 'nvidia' && profile.apiToken) headers['Authorization'] = `Bearer ${profile.apiToken}`;

  const result = await httpGet(healthUrl, timeoutMs, headers);

  if (result.ok) {
    let detail: string | undefined;
    if (profile.provider === 'ollama') {
      try {
        detail = (JSON.parse(result.body ?? '{}') as { version?: string }).version;
      } catch {
        /* ignore */
      }
    }
    return { ok: true, detail, healthUrl };
  }

  if (result.error) {
    return { ok: false, error: result.error, healthUrl };
  }

  if (result.status === 401 || result.status === 403) {
    return { ok: false, authFailed: true, status: result.status, healthUrl };
  }

  return { ok: false, status: result.status, healthUrl };
}

export interface TelegramTokenCheckResult {
  ok: boolean;
  username?: string;
  error?: string;
  networkError?: boolean;
}

export async function checkTelegramToken(token: string, timeoutMs = 8000): Promise<TelegramTokenCheckResult> {
  const result = await httpGet(`https://api.telegram.org/bot${token.trim()}/getMe`, timeoutMs);

  if (result.ok) {
    try {
      const data = JSON.parse(result.body ?? '{}') as { ok?: boolean; result?: { username?: string } };
      if (data.ok === false) {
        return { ok: false, error: 'Telegram API rejected the token' };
      }
      return { ok: true, username: data.result?.username };
    } catch {
      return { ok: true };
    }
  }

  if (result.error) {
    return { ok: false, networkError: true, error: result.error };
  }

  return { ok: false, error: `HTTP ${result.status} from Telegram API` };
}
