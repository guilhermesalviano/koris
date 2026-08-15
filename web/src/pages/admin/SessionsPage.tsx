import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { SessionsResponse, SessionDetailResponse } from '../../lib/types';

export default function SessionsPage() {
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<SessionsResponse>('/sessions?limit=50');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await apiRequest<SessionDetailResponse>(`/sessions/${id}`);
      setDetail(res);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load session');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this session and all its messages?')) return;
    try {
      await apiRequest(`/sessions/${id}`, { method: 'DELETE' });
      showToast('Session deleted');
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    }
  }

  return (
    <PageShell title="Sessions" onRefresh={() => { load(); if (selectedId) loadDetail(selectedId); }}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && data.items.length === 0 && <EmptyState text="No sessions yet." />}
      {!error && data && data.items.length > 0 && (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-subtle text-left font-mono text-[11px] uppercase tracking-wide text-txt-3">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Initiated channel</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Ended</th>
                  <th className="px-3 py-2">Msgs</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-subtle/60 cursor-pointer hover:bg-bg-3/60" onClick={() => loadDetail(s.id)}>
                    <td className="px-3 py-2 font-mono text-xs text-txt-2">{s.id.slice(0, 12)}…</td>
                    <td className="px-3 py-2 text-sm">{s.entryChannel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-txt-2">{formatDate(s.startedAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-txt-2">
                      {s.endedAt ? formatDate(s.endedAt) : <span className="text-green-400">open</span>}
                    </td>
                    <td className="px-3 py-2 text-sm">{s.messageCount}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={(e) => deleteSession(s.id, e)}
                        className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedId && (
        <div className="mt-4">
          {detailError && <EmptyState text={detailError} />}
          {!detailError && !detail && <EmptyState text="Loading session…" />}
          {!detailError && detail && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Messages</div>
                <div className="max-h-96 overflow-y-auto">
                  {detail.messages.length === 0 && <EmptyState text="No messages." />}
                  {detail.messages.map((m) => (
                    <div key={m.id} className="mb-2 rounded-lg border border-subtle bg-bg-3 px-3 py-2">
                      <div className="font-mono text-[10px] uppercase text-txt-3">{m.role} · {formatDate(m.createdAt)}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Memories</div>
                <div className="max-h-96 overflow-y-auto">
                  {detail.memories.length === 0 && <EmptyState text="No memories." />}
                  {detail.memories.map((m) => (
                    <div key={m.id} className="mb-2 rounded-lg border border-subtle bg-bg-3 px-3 py-2">
                      <div className="font-mono text-[10px] uppercase text-txt-3">{m.type} · {formatDate(m.createdAt)}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
