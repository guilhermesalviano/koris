import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { HeartbeatsResponse } from '../../lib/types';

export default function HeartbeatsPage() {
  const [data, setData] = useState<HeartbeatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [beat, setBeat] = useState('');
  const [cronExpression, setCronExpression] = useState('');
  const [type, setType] = useState<'reminder' | 'scheduled_beat'>('reminder');
  const [channel, setChannel] = useState<'telegram' | 'whatsapp' | ''>('');
  const [target, setTarget] = useState('');
  const [toastMsg, showToast, isError] = useToast();
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<HeartbeatsResponse>('/heartbeats');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load beats');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBeat(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/heartbeats', {
        method: 'POST',
        body: JSON.stringify({
          beat,
          cronExpression,
          type,
          channel: channel || undefined,
          target: target || undefined,
        }),
      });
      showToast('Beat created');
      setBeat('');
      setCronExpression('');
      setType('reminder');
      setChannel('');
      setTarget('');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed', true);
    }
  }

  async function deleteBeat(id: string) {
    try {
      await apiRequest(`/heartbeats/${id}`, { method: 'DELETE' });
      showToast('Beat deleted');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    }
  }

  return (
    <PageShell title="Beats" description="Scheduled heartbeat agents" onRefresh={load}>
      <Card>
        <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">New beat</div>
        <form onSubmit={createBeat} className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            required
            value={beat}
            onChange={(e) => setBeat(e.target.value)}
            placeholder="Beat instructions"
            className="rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent md:col-span-2"
          />
          <input
            required
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="Cron (0 9 * * 1)"
            className="rounded-lg border border-strong bg-bg-3 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'reminder' | 'scheduled_beat')}
            className="rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="reminder">reminder</option>
            <option value="scheduled_beat">scheduled_beat</option>
          </select>
          <div className="flex gap-2 md:col-span-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'telegram' | 'whatsapp' | '')}
              className="w-1/3 rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">channel</option>
              <option value="telegram">telegram</option>
              <option value="whatsapp">whatsapp</option>
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="chat id / jid (optional)"
              className="flex-1 rounded-lg border border-strong bg-bg-3 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium hover:opacity-90 md:col-span-4">
            Create beat
          </button>
        </form>
      </Card>

      <div className="mt-4">
        {error && <EmptyState text={error} />}
        {!error && !data && <EmptyState text="Loading…" />}
        {!error && data && data.items.length === 0 && <Card><EmptyState text="No beats scheduled." /></Card>}
        {!error && data && data.items.length > 0 && (
          <Card>
            {data.items.map((h) => (
              <div key={h.id} className="mb-2 rounded-lg border border-subtle bg-bg-3 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-txt-3">
                      <span>{h.type}</span>
                      <code>{h.cron_expression}</code>
                      <span>id: <code>{h.id}</code></span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{h.beat}</div>
                    <div className="mt-2 grid grid-cols-1 gap-1 font-mono text-[11px] text-txt-2 sm:grid-cols-2">
                      <div>Last run: <span className="text-txt">{formatDate(h.last_run)}</span></div>
                      <div>Next run: <span className="text-txt">{formatDate(h.next_run)}</span></div>
                      <div>Created: <span className="text-txt">{formatDate(h.created_at)}</span></div>
                      {h.channel && h.target && (
                        <div>
                          Delivery: <span className="text-txt">{h.channel}: <code>{h.target}</code></span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteBeat(h.id)}
                    className="flex-shrink-0 rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
