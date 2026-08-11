import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { MemoriesResponse } from '../../lib/types';

export default function MemoriesPage() {
  const [data, setData] = useState<MemoriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<MemoriesResponse>('/memories');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteMemory(id: string) {
    try {
      await apiRequest(`/memories/${id}`, { method: 'DELETE' });
      showToast('Memory deleted');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    }
  }

  return (
    <PageShell title="Memories" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && data.items.length === 0 && <EmptyState text="No memories yet." />}
      {!error && data && data.items.length > 0 && (
        <Card>
          {data.items.map((m) => (
            <div key={m.id} className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-subtle bg-bg-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase text-txt-3">
                  {m.type} · session {(m.sessionId ?? '').slice(0, 8)}… · {formatDate(m.createdAt)}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
              </div>
              <button
                onClick={() => deleteMemory(m.id)}
                className="flex-shrink-0 rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </Card>
      )}
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
