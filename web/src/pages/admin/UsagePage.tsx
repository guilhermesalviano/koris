import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, StatCard } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { UsageReport, UsageStats } from '../../lib/types';

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All time' },
  { value: '0', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours >= 48 ? `${(hours / 24).toFixed(1)}d` : `${hours}h ${minutes % 60}m`;
}

function statRows(stats: Record<string, UsageStats>): { name: string; stats: UsageStats }[] {
  return Object.entries(stats)
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .map(([name, s]) => ({ name, stats: s }));
}

function BreakdownTable({ title, rows }: { title: string; rows: { name: string; stats: UsageStats }[] }) {
  return (
    <Card className="!p-0">
      <div className="border-b border-subtle px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide text-txt-3">{title}</div>
      {rows.length === 0 ? (
        <EmptyState text="No data" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-subtle text-left font-mono text-[11px] uppercase tracking-wide text-txt-3">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 text-right">Calls</th>
                <th className="px-4 py-2 text-right">In</th>
                <th className="px-4 py-2 text-right">Out</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ name, stats }) => (
                <tr key={name} className="border-b border-subtle/60 last:border-0">
                  <td className="max-w-[240px] truncate px-4 py-2 font-mono text-xs text-txt">{name}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-txt-2">
                    {stats.calls > 0 ? stats.calls : ''}
                    {stats.toolCalls > 0 && <span className="text-txt-3">{stats.calls > 0 ? ' + ' : ''}{stats.toolCalls}t</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-txt-2">{formatTokens(stats.inputTokens)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-txt-2">{formatTokens(stats.outputTokens)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-txt font-semibold">{formatTokens(stats.totalTokens)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-txt-3">{formatDuration(stats.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function UsagePage() {
  const [days, setDays] = useState('');
  const [data, setData] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = days !== '' ? `?days=${days}` : '';
      const res = await apiRequest<UsageReport>(`/usage${query}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data?.total;

  return (
    <PageShell title="Token usage" onRefresh={load}>
      <div className="mb-4 flex items-center gap-2">
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="rounded-lg border border-strong bg-bg-3 px-3 py-1.5 font-mono text-[11px] text-txt-2 outline-none focus:border-accent"
        >
          {DAY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="LLM calls" value={total?.calls ?? 0} />
            <StatCard label="Tool calls" value={total?.toolCalls ?? 0} />
            <StatCard label="Total tokens" value={formatTokens(total?.totalTokens ?? 0)} />
            <StatCard label="Time" value={formatDuration(total?.durationMs ?? 0)} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <BreakdownTable title="By agent" rows={statRows(data.byAgent)} />
            <BreakdownTable title="By channel" rows={statRows(data.byChannel)} />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <BreakdownTable title="By tool" rows={statRows(data.byTool)} />
          </div>
        </>
      )}
    </PageShell>
  );
}
