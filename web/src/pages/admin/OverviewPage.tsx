import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell, Card, EmptyState, StatCard, formatDate } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { OverviewResponse } from '../../lib/types';

const POLL_INTERVAL_MS = 10_000;

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

function StatusPill({ on, label }: { on: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
        on ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-subtle bg-bg text-txt-3'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-green-500' : 'bg-bg-3'}`} />
      {label ?? (on ? 'on' : 'off')}
    </span>
  );
}

function LiveActivity({ data }: { data: OverviewResponse }) {
  const queue = data.queue;
  const subAgentQueuedLabels = queue.subAgents.flatMap((q) => q.queuedLabels);
  const totalWaiting = queue.queued.length + subAgentQueuedLabels.length;

  return (
    <Card>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Live activity</div>

      <div className="mb-3 flex flex-wrap gap-3">
        <StatusPill on={data.activeRuns.length > 0} label={`${data.activeRuns.length} active run${data.activeRuns.length === 1 ? '' : 's'}`} />
        <StatusPill on={queue.running.length > 0} label={`${queue.running.length} LLM running`} />
        <StatusPill on={totalWaiting > 0} label={`${totalWaiting} LLM waiting`} />
      </div>

      {data.activeRuns.length === 0 ? (
        <EmptyState text="No runs in progress" />
      ) : (
        <div className="space-y-2">
          {data.activeRuns.map((run) => (
            <div key={run.id} className="rounded-lg border border-accent/40 bg-accent-muted px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-accent" />
                <span className="truncate text-sm text-txt">{run.question || 'Untitled run'}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-txt-3">
                {run.channel} · started {formatDate(run.startedAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {queue.running.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-txt-3">In-flight LLM calls</div>
          <div className="flex flex-wrap gap-2">
            {queue.running.map((task, index) => (
              <span key={`${task.label}-${index}`} className="rounded-full border border-strong bg-bg-3 px-2.5 py-1 font-mono text-[11px] text-txt">
                {task.label || 'unnamed'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function UsageSummary({ data }: { data: OverviewResponse }) {
  const usage = data.usage;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-txt-3">Usage (last 7 days)</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-txt-2">LLM calls</span><span className="font-mono">{usage.calls}</span></div>
        <div className="flex justify-between"><span className="text-txt-2">Tool calls</span><span className="font-mono">{usage.toolCalls}</span></div>
        <div className="flex justify-between"><span className="text-txt-2">Tokens</span><span className="font-mono">{formatTokens(usage.totalTokens)}</span></div>
        <div className="flex justify-between"><span className="text-txt-2">Time</span><span className="font-mono">{formatDuration(usage.durationMs)}</span></div>
      </div>
    </Card>
  );
}

function ProvidersCard({ data }: { data: OverviewResponse }) {
  return (
    <Card>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Providers</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-txt-2">Manager</span>
          <span className="font-mono">{data.provider} · {data.model}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-2">Workers</span>
          <span className="font-mono">{data.workerProvider} · {data.workerModel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-2">Environment</span>
          <span className="font-mono">{data.environment}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-2">Timezone</span>
          <span className="font-mono">{data.timezone}</span>
        </div>
      </div>
    </Card>
  );
}

function ConfigCard({ data }: { data: OverviewResponse }) {
  return (
    <Card>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Config &amp; channels</div>
      <div className="mb-3 flex flex-wrap gap-2">
        <StatusPill on={data.heartbeatEnabled} label="heartbeat" />
        <StatusPill on={data.summarizerEnabled} label="summarizer" />
        <StatusPill on={data.aiParallel} label="ai.parallel" />
        <StatusPill on={data.aiSubagentsParallel} label="subagents_parallel" />
      </div>
      {data.channels.length > 0 && (
        <div className="mb-3 space-y-1.5 text-sm">
          {data.channels.map((channel) => (
            <div key={channel.type} className="flex items-center justify-between">
              <span className="font-mono text-txt-2">{channel.type}</span>
              <StatusPill on={channel.enabled} />
            </div>
          ))}
        </div>
      )}
      {data.registeredChannels.length > 0 && (
        <div className="space-y-1.5 text-sm">
          <div className="font-mono text-[10px] uppercase tracking-wide text-txt-3">Connected channels</div>
          {data.registeredChannels.map((channel) => (
            <div key={`${channel.type}:${channel.target}`} className="flex items-center justify-between">
              <span className="truncate font-mono text-xs text-txt-2">{channel.target}</span>
              <div className="flex items-center gap-1.5">
                {channel.principal && <span className="rounded-full border border-accent/40 bg-accent-muted px-2 py-0.5 font-mono text-[10px] text-accent-2">principal</span>}
                <span className="font-mono text-[10px] text-txt-3">{channel.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HealthCard({ data }: { data: OverviewResponse }) {
  const ok = data.health.status === 'ok';
  const details = data.health.details;

  return (
    <Card>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Health</div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={`font-mono ${ok ? 'text-green-400' : 'text-red-400'}`}>{data.health.status}</span>
      </div>
      {details !== undefined && details !== null && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">
          {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
        </pre>
      )}
      {ok && details === undefined && (
        <div className="mt-3 font-mono text-[11px] text-txt-3">Provider reachable.</div>
      )}
    </Card>
  );
}

function RecentErrorsCard({ data }: { data: OverviewResponse }) {
  const errors = data.recentErrors;

  return (
    <Card>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Recent errors</div>
      {errors.length === 0 ? (
        <EmptyState text="No recent errors" />
      ) : (
        <div className="space-y-2">
          {errors.map((error) => (
            <div key={error.id} className="rounded-lg border border-red-500/30 bg-[#2a1212]/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-red-300">
                  {error.agentName ?? 'unknown'}
                  {error.type && <span className="text-txt-3"> · {error.type}</span>}
                </span>
                <span className="flex-shrink-0 font-mono text-[10px] text-txt-3">{formatDate(error.createdAt)}</span>
              </div>
              {(error.errorMessage || error.errorCode) && (
                <div className="mt-1 truncate font-mono text-[11px] text-txt-2">
                  {error.errorCode && <span className="text-txt-3">{error.errorCode} · </span>}
                  {error.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    timerRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [load]);

  return (
    <PageShell title="Overview" onRefresh={load}>
      <div className="mb-4 font-mono text-[11px] text-txt-3">auto-refresh {POLL_INTERVAL_MS / 1000}s</div>

      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Sessions" value={data.sessions} />
            <StatCard label="Open sessions" value={data.openSessions} />
            <StatCard label="Messages" value={data.messages} />
            <StatCard label="Memories" value={data.memories} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Beats" value={data.heartbeats} />
            <StatCard label="Learned skills" value={`${data.learnedSkills}/${data.learnedSkillsLimit}`} />
            <StatCard label="Available skills" value={data.skills} />
            <div className="rounded-card border border-subtle bg-bg-2 p-5">
              <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">Audit errors</div>
              <div className={`mt-2 text-2xl font-medium ${data.auditErrors > 0 ? 'text-red-400' : ''}`}>{data.auditErrors}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LiveActivity data={data} />
            <UsageSummary data={data} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProvidersCard data={data} />
            <ConfigCard data={data} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HealthCard data={data} />
            <RecentErrorsCard data={data} />
          </div>
        </>
      )}
    </PageShell>
  );
}