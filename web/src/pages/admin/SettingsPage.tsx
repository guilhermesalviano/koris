import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';

export default function SettingsPage() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<unknown>('/settings');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell title="Settings" description="Runtime configuration" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data !== null && (
        <Card>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">
            Effective settings (read-only, secrets masked)
          </div>
          <pre className="max-h-[70vh] overflow-auto rounded-lg bg-bg-3 p-4 font-mono text-[12px] text-txt-2">
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </PageShell>
  );
}
