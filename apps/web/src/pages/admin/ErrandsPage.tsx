import { SettingsSection } from '../../components/SettingsUI';
import { useCallback, useEffect, useState } from 'react';
import { Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { ErrandsResponse, ErrandItem, ErrandState } from '../../lib/types';

const STALE_STATES: ErrandState[] = ['open', 'awaiting_peer', 'awaiting_principal', 'expired'];

function statusLabel(state: ErrandState): string {
  switch (state) {
    case 'draft': return 'awaiting your approval';
    case 'queued': return 'queued behind another errand';
    case 'open': return 'in progress';
    case 'awaiting_peer': return 'waiting on them';
    case 'awaiting_principal': return 'waiting on you';
    case 'resolved': return 'resolved';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'expired': return 'expired';
    default: return state;
  }
}

function statusClass(state: ErrandState): string {
  switch (state) {
    case 'awaiting_principal': return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    case 'awaiting_peer':
    case 'open': return 'border-accent/40 bg-accent-muted text-accent-2';
    case 'resolved': return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'failed':
    case 'expired': return 'border-red-500/40 bg-red-500/10 text-red-400';
    case 'cancelled': return 'border-subtle text-txt-3';
    default: return 'border-subtle text-txt-2';
  }
}

/** Stale/expired first, then by recency — a quiet errand needing you is
 * more important than a fresh one that's still moving. */
function sortErrands(items: ErrandItem[]): ErrandItem[] {
  return [...items].sort((a, b) => {
    const aStale = STALE_STATES.includes(a.state) ? 1 : 0;
    const bStale = STALE_STATES.includes(b.state) ? 1 : 0;
    if (aStale !== bStale) return bStale - aStale;
    const aTime = new Date(a.lastProgressAt ?? a.createdAt).getTime();
    const bTime = new Date(b.lastProgressAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

export default function ErrandsPage() {
  const [data, setData] = useState<ErrandsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, showToast, isError] = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<ErrandsResponse>('/errands?limit=50');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load errands');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'cancel' | 'close') {
    setBusyId(id);
    try {
      await apiRequest(`/errands/${id}/${action}`, { method: 'POST' });
      showToast(`Errand ${action === 'approve' ? 'approved' : action === 'cancel' ? 'cancelled' : 'closed'}`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Failed to ${action} errand`, true);
    } finally {
      setBusyId(null);
    }
  }

  const items = data ? sortErrands(data.items) : [];

  return (
    <SettingsSection title="Errands" description="Delegated conversations koris is running on your behalf" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && items.length === 0 && (
        <EmptyState text="No errands yet. Start one with /errand <goal> with <contact> on <channel>." />
      )}
      {!error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((errand) => (
            <Card key={errand.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(errand.state)}`}>
                      {statusLabel(errand.state)}
                    </span>
                    <span className="font-mono text-[10px] text-txt-3">{errand.id.slice(0, 12)}…</span>
                  </div>
                  <div className="mt-1.5 text-sm text-txt">{errand.goal}</div>
                  {errand.notes && (
                    <div className="mt-1 text-xs text-txt-2">
                      <span className="text-txt-3">notes: </span>{errand.notes}
                    </div>
                  )}
                  {errand.result && (
                    <div className="mt-1 text-xs text-txt-2">
                      <span className="text-txt-3">result: </span>{errand.result}
                    </div>
                  )}
                  <div className="mt-1.5 font-mono text-[10px] text-txt-3">
                    {errand.targets.length} target{errand.targets.length === 1 ? '' : 's'} · started {formatDate(errand.createdAt)}
                    {errand.lastProgressAt ? ` · last progress ${formatDate(errand.lastProgressAt)}` : ''}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {errand.state === 'draft' && (
                    <button
                      disabled={busyId === errand.id}
                      onClick={() => act(errand.id, 'approve')}
                      className="rounded-md border border-accent/40 bg-accent-muted px-2 py-1 font-mono text-[11px] text-accent-2 hover:border-accent disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {!['resolved', 'failed', 'cancelled', 'expired'].includes(errand.state) && (
                    <>
                      <button
                        disabled={busyId === errand.id}
                        onClick={() => act(errand.id, 'close')}
                        className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-emerald-500/40 hover:text-emerald-400 disabled:opacity-50"
                      >
                        Close
                      </button>
                      <button
                        disabled={busyId === errand.id}
                        onClick={() => act(errand.id, 'cancel')}
                        className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Toast message={toastMsg} isError={isError} />
    </SettingsSection>
  );
}
