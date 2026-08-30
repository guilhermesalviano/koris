import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiRequestError } from './api';
import type { ConnectorCatalogEntry, ConnectorRole, ConnectorsResponse, ActiveConnector } from './types';
import type { ConnectionTestResult } from './use-settings-form';

const EMPTY_ACTIVE: ActiveConnector = { provider: '', model: '', baseUrl: '', hasToken: false };

export interface ActivateInput {
  provider: string;
  model: string;
  apiToken: string;
  baseUrl: string;
}

export function useConnectors() {
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);
  const [active, setActive] = useState<Record<ConnectorRole, ActiveConnector>>({
    manager: EMPTY_ACTIVE,
    workers: EMPTY_ACTIVE,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ConnectorsResponse>('/connectors');
      setCatalog(res.connectors);
      setActive(res.active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors');
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

  const activate = useCallback(async (role: ConnectorRole, input: ActivateInput): Promise<{ ok: boolean; errors?: string[] }> => {
    const profile: Record<string, unknown> = {
      provider: input.provider,
      base_url: input.baseUrl,
      model: input.model,
    };
    if (input.apiToken) profile.api_token = input.apiToken;

    try {
      await apiRequest('/settings', {
        method: 'POST',
        body: JSON.stringify({ ai: { [role]: profile } }),
      });
      await load();
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiRequestError && err.details?.length) {
        return { ok: false, errors: err.details };
      }
      return { ok: false, errors: [err instanceof Error ? err.message : 'Failed to activate connector'] };
    }
  }, [load]);

  return { catalog, active, loading, error, reload: load, test, activate };
}

export type UseConnectorsApi = ReturnType<typeof useConnectors>;
