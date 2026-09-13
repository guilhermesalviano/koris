import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import type { AgentSummary, AgentsResponse } from './types';

// The roster is static on the server, so the desktop sidebar and the mobile
// drawer share one request for the lifetime of the page.
let rosterRequest: Promise<AgentSummary[]> | null = null;

function loadRoster(): Promise<AgentSummary[]> {
  if (!rosterRequest) {
    rosterRequest = apiRequest<AgentsResponse>('/agents')
      .then((res) => res.items)
      .catch((err: unknown) => {
        rosterRequest = null;
        throw err;
      });
  }
  return rosterRequest;
}

export function useAgents(): { agents: AgentSummary[]; loading: boolean; error: string | null } {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRoster()
      .then((items) => {
        if (!cancelled) setAgents(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agents');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { agents, loading, error };
}
