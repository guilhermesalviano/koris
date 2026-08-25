import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { ChannelsResponse } from '../../lib/types';

export default function ChannelsPage() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<ChannelsResponse>('/channels');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setPrincipal(id: string) {
    try {
      await apiRequest(`/channels/${id}/principal`, { method: 'PATCH' });
      showToast('Principal channel updated');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', true);
    }
  }

  const principal = data?.items.find((c) => c.isPrincipal);

  return (
    <PageShell title="Channels" description="Connected messaging channels" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          {data.items.length === 0 && (
            <Card>
              <EmptyState text="No channels recorded yet. The first message sent via Telegram or WhatsApp sets the principal channel." />
            </Card>
          )}
          {data.items.length > 0 && (
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">
                Recorded channels ({data.items.length})
              </div>
              {data.items.map((c) => (
                <div
                  key={c.id}
                  className={`mb-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    c.isPrincipal ? 'border-accent-muted bg-accent-muted' : 'border-subtle bg-bg-3'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-accent-2">{c.channel}</span>
                      {c.isPrincipal && (
                        <span className="rounded-full border border-accent-muted bg-accent-muted px-2 py-0.5 font-mono text-[10px] text-accent-2">
                          principal
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-txt-2">{c.target}</div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <div className="font-mono text-[10px] text-txt-3">{formatDate(c.createdAt)}</div>
                    {!c.isPrincipal && (
                      <button
                        onClick={() => setPrincipal(c.id)}
                        className="rounded-md border border-subtle px-2 py-0.5 font-mono text-[10px] text-txt-3 hover:border-accent hover:text-accent-2"
                      >
                        Set principal
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
          {principal && (
            <div className="mt-3">
              <Card>
                <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">
                  Principal channel
                </div>
                <p className="mt-1 text-sm text-txt-2">
                  Heartbeat results are delivered to{' '}
                  <span className="font-mono text-accent-2">
                    {principal.channel} · {principal.target}
                  </span>{' '}
                  unless a beat specifies its own channel and target.
                </p>
              </Card>
            </div>
          )}
        </>
      )}
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
