import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, StatCard } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { OverviewResponse } from '../../lib/types';

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<OverviewResponse>('/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell title="Overview" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Sessions" value={data.sessions} />
            <StatCard label="Beats" value={data.heartbeats} />
            <StatCard label="Learned skills" value={data.learnedSkills} />
            <StatCard label="Available skills" value={data.skills} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Provider</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-txt-2">AI Provider</span><span className="font-mono">{data.provider}</span></div>
                <div className="flex justify-between"><span className="text-txt-2">Model</span><span className="font-mono">{data.model}</span></div>
                <div className="flex justify-between"><span className="text-txt-2">Environment</span><span className="font-mono">{data.environment}</span></div>
              </div>
            </Card>
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Health</div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${data.health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`font-mono ${data.health.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{data.health.status}</span>
              </div>
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">
                {JSON.stringify(data.health.details ?? {}, null, 2)}
              </pre>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
