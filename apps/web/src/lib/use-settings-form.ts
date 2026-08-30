import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiRequestError } from './api';

export interface RuntimeAiProfile {
  PROVIDER?: string;
  BASE_URL?: string;
  API_TOKEN?: string;
  MODEL?: string;
}

export interface RuntimeSettings {
  WEB_PORT?: number;
  AI?: {
    MANAGER?: RuntimeAiProfile;
    WORKERS?: RuntimeAiProfile;
    SEARCH_API_KEY?: string;
  };
  CHANNELS?: {
    TELEGRAM?: { ENABLED?: boolean; BOT_TOKEN?: string; WHITELIST?: string };
    WHATSAPP?: { ENABLED?: boolean; WHITELIST?: string; MENTION_ID?: string };
  };
  ALLOWED_DOMAINS?: string[];
  PERSONAL_INFORMATION?: Record<string, string>;
}

export interface AiProfileForm {
  provider: string;
  base_url: string;
  api_token: string;
  model: string;
}

export interface SettingsFormState {
  sameForBoth: boolean;
  manager: AiProfileForm;
  workers: AiProfileForm;
  search_api_key: string;
  telegram: { bot_token: string; whitelist: string };
  whatsapp: { mention_id: string; whitelist: string };
  allowed_domains: string[];
  personal_information: Record<string, string>;
}

const EMPTY_PROFILE: AiProfileForm = { provider: 'ollama', base_url: '', api_token: '', model: '' };

export const DEFAULT_FORM: SettingsFormState = {
  sameForBoth: true,
  manager: { ...EMPTY_PROFILE },
  workers: { ...EMPTY_PROFILE },
  search_api_key: '',
  telegram: { bot_token: '', whitelist: '' },
  whatsapp: { mention_id: '', whitelist: '' },
  allowed_domains: [],
  personal_information: {},
};

/** A value containing the masking marker means a real secret is already stored server-side. */
export function isMasked(value: string | undefined): boolean {
  return !!value && value.includes('••••');
}

function secretFieldDefault(value: string | undefined): string {
  return isMasked(value) ? '' : value ?? '';
}

function mapProfile(profile: RuntimeAiProfile | undefined): AiProfileForm {
  return {
    provider: profile?.PROVIDER ?? EMPTY_PROFILE.provider,
    base_url: profile?.BASE_URL ?? '',
    api_token: secretFieldDefault(profile?.API_TOKEN),
    model: profile?.MODEL ?? '',
  };
}

export function mapRuntimeToForm(data: RuntimeSettings): SettingsFormState {
  const manager = mapProfile(data.AI?.MANAGER);
  const workers = mapProfile(data.AI?.WORKERS);
  const sameForBoth = manager.provider === workers.provider
    && manager.base_url === workers.base_url
    && manager.model === workers.model;

  return {
    sameForBoth,
    manager,
    workers,
    search_api_key: secretFieldDefault(data.AI?.SEARCH_API_KEY),
    telegram: {
      bot_token: secretFieldDefault(data.CHANNELS?.TELEGRAM?.BOT_TOKEN),
      whitelist: data.CHANNELS?.TELEGRAM?.WHITELIST ?? '',
    },
    whatsapp: {
      mention_id: data.CHANNELS?.WHATSAPP?.MENTION_ID ?? '',
      whitelist: data.CHANNELS?.WHATSAPP?.WHITELIST ?? '',
    },
    allowed_domains: data.ALLOWED_DOMAINS ?? [],
    personal_information: data.PERSONAL_INFORMATION ?? {},
  };
}

function buildProfilePatch(profile: AiProfileForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    provider: profile.provider,
    base_url: profile.base_url,
    model: profile.model,
  };
  if (profile.api_token) patch.api_token = profile.api_token;
  return patch;
}

/** Channel-only slice of the settings payload (telegram/whatsapp secrets + whitelists). */
export function buildChannelsPatch(form: SettingsFormState): Record<string, unknown> {
  const telegram: Record<string, unknown> = { whitelist: form.telegram.whitelist };
  if (form.telegram.bot_token) telegram.bot_token = form.telegram.bot_token;

  return {
    channels: {
      telegram,
      whatsapp: {
        mention_id: form.whatsapp.mention_id,
        whitelist: form.whatsapp.whitelist,
      },
    },
  };
}

/** "General" slice: web search key, allowed domains, personal info — no provider/channel config. */
export function buildGeneralPatch(form: SettingsFormState): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (form.search_api_key) {
    patch.ai = { search_api_key: form.search_api_key };
  }
  if (form.allowed_domains.length > 0) {
    patch.allowed_domains = form.allowed_domains;
  }
  if (Object.keys(form.personal_information).length > 0) {
    patch.personal_information = form.personal_information;
  }

  return patch;
}

/** Builds the partial snake_case payload for POST /settings from the current form state. */
export function buildSettingsPatch(form: SettingsFormState): Record<string, unknown> {
  const workers = form.sameForBoth ? form.manager : form.workers;

  const patch: Record<string, unknown> = {
    ai: {
      manager: buildProfilePatch(form.manager),
      workers: buildProfilePatch(workers),
    },
    channels: {
      telegram: {
        whitelist: form.telegram.whitelist,
      },
      whatsapp: {
        mention_id: form.whatsapp.mention_id,
        whitelist: form.whatsapp.whitelist,
      },
    },
  };

  if (form.telegram.bot_token) {
    (patch.channels as Record<string, unknown>).telegram = {
      ...(patch.channels as Record<string, Record<string, unknown>>).telegram,
      bot_token: form.telegram.bot_token,
    };
  }

  if (form.search_api_key) {
    (patch.ai as Record<string, unknown>).search_api_key = form.search_api_key;
  }

  if (form.allowed_domains.length > 0) {
    patch.allowed_domains = form.allowed_domains;
  }

  if (Object.keys(form.personal_information).length > 0) {
    patch.personal_information = form.personal_information;
  }

  return patch;
}

export interface ConnectionTestResult {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  error?: string;
  authFailed?: boolean;
  status?: number;
}

/** Human-readable one-liner for a provider connection test result. */
export function formatConnectionTestResult(result: ConnectionTestResult): string {
  if (result.ok) {
    return result.skipped
      ? 'mock provider — no check needed'
      : `reachable${result.detail ? ` (v${result.detail})` : ''}`;
  }
  return result.authFailed
    ? `auth failed (HTTP ${result.status})`
    : (result.error ?? `HTTP ${result.status}`);
}

export interface TelegramTestResult {
  ok: boolean;
  username?: string;
  error?: string;
  networkError?: boolean;
}

export function useSettingsForm() {
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_FORM);
  const [original, setOriginal] = useState<RuntimeSettings | null>(null);
  const [providers, setProviders] = useState<string[]>(['ollama', 'nvidia', 'openai', 'deepseek']);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [connectionResults, setConnectionResults] = useState<Partial<Record<'manager' | 'workers', ConnectionTestResult>>>({});
  const [testingConnection, setTestingConnection] = useState<Partial<Record<'manager' | 'workers', boolean>>>({});
  const [telegramTestResult, setTelegramTestResult] = useState<TelegramTestResult | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [whatsappConnecting, setWhatsappConnecting] = useState(false);
  const [whatsappConnectResult, setWhatsappConnectResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [settings, capabilities] = await Promise.all([
        apiRequest<RuntimeSettings>('/settings'),
        apiRequest<{ providers: string[]; channels: string[] }>('/capabilities').catch(() => null),
      ]);
      setOriginal(settings);
      setForm(mapRuntimeToForm(settings));
      if (capabilities?.providers?.length) setProviders(capabilities.providers);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback((updater: (prev: SettingsFormState) => SettingsFormState) => {
    setForm((prev) => updater(prev));
  }, []);

  const testProviderConnection = useCallback(async (role: 'manager' | 'workers') => {
    const profile = role === 'manager' ? form.manager : (form.sameForBoth ? form.manager : form.workers);
    setTestingConnection((prev) => ({ ...prev, [role]: true }));
    try {
      const result = await apiRequest<ConnectionTestResult>('/ai/test-connection', {
        method: 'POST',
        body: JSON.stringify({ provider: profile.provider, base_url: profile.base_url, api_token: profile.api_token }),
      });
      setConnectionResults((prev) => ({ ...prev, [role]: result }));
    } catch (err) {
      setConnectionResults((prev) => ({ ...prev, [role]: { ok: false, error: err instanceof Error ? err.message : 'Test failed' } }));
    } finally {
      setTestingConnection((prev) => ({ ...prev, [role]: false }));
    }
  }, [form.manager, form.workers, form.sameForBoth]);

  const testTelegramToken = useCallback(async () => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const result = await apiRequest<TelegramTestResult>('/telegram/test-token', {
        method: 'POST',
        body: JSON.stringify({ bot_token: form.telegram.bot_token }),
      });
      setTelegramTestResult(result);
    } catch (err) {
      setTelegramTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTestingTelegram(false);
    }
  }, [form.telegram.bot_token]);

  const connectWhatsApp = useCallback(async () => {
    setWhatsappConnecting(true);
    setWhatsappConnectResult(null);
    try {
      await apiRequest('/whatsapp/connect', { method: 'POST' });
      setWhatsappConnectResult('Connection attempt started — check the server terminal for a QR code to scan.');
    } catch (err) {
      setWhatsappConnectResult(err instanceof Error ? err.message : 'Failed to start WhatsApp connection');
    } finally {
      setWhatsappConnecting(false);
    }
  }, []);

  const submit = useCallback(async (patchOverride?: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setSaveErrors(null);
    setSaveSuccess(false);
    try {
      const patch = patchOverride ?? buildSettingsPatch(form);
      const res = await apiRequest<{ success: boolean; settings: RuntimeSettings }>('/settings', {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      setOriginal(res.settings);
      setForm(mapRuntimeToForm(res.settings));
      setSaveSuccess(true);
      return true;
    } catch (err) {
      if (err instanceof ApiRequestError && err.details?.length) {
        setSaveErrors(err.details);
      } else {
        setSaveErrors([err instanceof Error ? err.message : 'Failed to save settings']);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [form]);

  return {
    form,
    update,
    original,
    providers,
    loading,
    loadError,
    reload: load,
    saving,
    saveErrors,
    saveSuccess,
    submit,
    testProviderConnection,
    connectionResults,
    testingConnection,
    testTelegramToken,
    telegramTestResult,
    testingTelegram,
    connectWhatsApp,
    whatsappConnecting,
    whatsappConnectResult,
  };
}

export type SettingsFormApi = ReturnType<typeof useSettingsForm>;
