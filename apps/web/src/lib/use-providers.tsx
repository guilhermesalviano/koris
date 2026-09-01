import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, ApiRequestError } from './api';
import type { ProviderCatalogEntry, ProviderRole, ProvidersResponse, ActiveProvider } from './types';
import type { ConnectionTestResult } from './use-settings-form';

const EMPTY_ACTIVE: ActiveProvider = { provider: '', model: '', baseUrl: '', hasToken: false };
const EMPTY_EMBED: ActiveProvider & { enabled: boolean } = { ...EMPTY_ACTIVE, enabled: false };

type ActiveState = Record<ProviderRole, ActiveProvider> & {
  embed: ActiveProvider & { enabled: boolean };
};

export interface ActivateInput {
  provider: string;
  model: string;
  apiToken: string;
  baseUrl: string;
}

export interface EmbedInput {
  enabled: boolean;
  provider: string;
  model: string;
  apiToken: string;
}

interface ProvidersContextValue {
  catalog: ProviderCatalogEntry[];
  active: ActiveState;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  test: (input: { provider: string; baseUrl: string; apiToken: string }) => Promise<ConnectionTestResult>;
  saveProvider: (input: ActivateInput) => Promise<{ ok: boolean; errors?: string[] }>;
  activate: (role: ProviderRole, input: ActivateInput) => Promise<{ ok: boolean; errors?: string[] }>;
  setEmbed: (input: EmbedInput) => Promise<{ ok: boolean; errors?: string[] }>;
}

const ProvidersContext = createContext<ProvidersContextValue | null>(null);

export function ProvidersProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [active, setActive] = useState<ActiveState>({
    manager: EMPTY_ACTIVE,
    workers: EMPTY_ACTIVE,
    embed: EMPTY_EMBED,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ProvidersResponse>('/providers');
      setCatalog(res.providers);
      setActive(res.active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const test = useCallback(async (input: { provider: string; baseUrl: string; apiToken: string }): Promise<ConnectionTestResult> => {
    try {
      return await apiRequest<ConnectionTestResult>('/ai/test-connection', {
        method: 'POST',
        body: JSON.stringify({ provider: input.provider, base_url: input.baseUrl, api_token: input.apiToken }),
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Test failed' };
    }
  }, []);

  const buildProfile = (input: ActivateInput): Record<string, unknown> => {
    const profile: Record<string, unknown> = {
      provider: input.provider,
      base_url: input.baseUrl,
      model: input.model,
    };
    if (input.apiToken) profile.api_token = input.apiToken;
    return profile;
  };

  const postSettings = useCallback(
    async (body: Record<string, unknown>, failMsg: string): Promise<{ ok: boolean; errors?: string[] }> => {
      try {
        await apiRequest('/settings', { method: 'POST', body: JSON.stringify(body) });
        await load();
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiRequestError && err.details?.length) {
          return { ok: false, errors: err.details };
        }
        return { ok: false, errors: [err instanceof Error ? err.message : failMsg] };
      }
    },
    [load],
  );

  // Save a provider's config into ai.providers[] without changing which
  // provider is active for any role.
  const saveProvider = useCallback(
    (input: ActivateInput) => postSettings({ ai: { provider: buildProfile(input) } }, 'Failed to save provider'),
    [postSettings],
  );

  // Save + make this provider the active one for `role`.
  const activate = useCallback(
    (role: ProviderRole, input: ActivateInput) =>
      postSettings({ ai: { [role]: buildProfile(input) } }, 'Failed to activate provider'),
    [postSettings],
  );

  // Point the embeddings config at a provider/model (base_url/api_token reused
  // from the matching ai.providers[] entry) and toggle it on/off.
  const setEmbed = useCallback(
    (input: EmbedInput) => {
      const embed: Record<string, unknown> = {
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
      };
      if (input.apiToken) embed.api_token = input.apiToken;
      return postSettings({ ai: { embed } }, 'Failed to update embeddings');
    },
    [postSettings],
  );

  const value: ProvidersContextValue = { catalog, active, loading, error, reload: load, test, saveProvider, activate, setEmbed };

  return <ProvidersContext.Provider value={value}>{children}</ProvidersContext.Provider>;
}

export function useProviders(): ProvidersContextValue {
  const ctx = useContext(ProvidersContext);
  if (!ctx) {
    throw new Error('useProviders must be used within a ProvidersProvider');
  }
  return ctx;
}
