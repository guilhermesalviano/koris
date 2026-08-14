import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell, Card, EmptyState, StatCard } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { QueueResponse, QueueTaskInfo, SubAgentQueueState } from '../../lib/types';

const POLL_INTERVAL_MS = 1500;

function priorityInfo(priority: number): { label: string; className: string } {
  return priority >= 1
    ? { label: 'interactive', className: 'border-green-500/40 bg-green-500/10 text-green-300' }
    : { label: 'background', className: 'border-amber-500/40 bg-amber-500/10 text-amber-300' };
}

function TaskChip({ task, muted = false }: { task: QueueTaskInfo; muted?: boolean }) {
  const prio = priorityInfo(task.priority);
  return (
    <div
      className={`flex w-44 flex-col gap-2 rounded-card border bg-bg-3 p-3 ${muted ? 'border-subtle opacity-50' : 'border-strong'}`}
    >
      <span className="truncate font-mono text-xs text-txt">{task.label || 'unnamed'}</span>
      <div className="flex items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${prio.className}`}>{prio.label}</span>
        {!task.eligible && (
          <span className="rounded-full border border-subtle bg-bg px-2 py-0.5 font-mono text-[10px] text-txt-3">held</span>
        )}
      </div>
    </div>
  );
}

function Processor({ running }: { running: QueueTaskInfo[] }) {
  if (running.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-card border border-dashed border-subtle bg-bg-2 font-mono text-xs text-txt-3">
        Idle — no LLM call in progress
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {running.map((task, index) => {
        const prio = priorityInfo(task.priority);
        return (
          <div key={`${task.label}-${index}`} className="flex h-18 items-center gap-3 rounded-card border border-accent/50 bg-accent-muted p-4">
            <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm text-txt">{task.label || 'unnamed'}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${prio.className}`}>{prio.label}</span>
                <span className="font-mono text-[10px] text-txt-3">running</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function subAgentStatus(queue: SubAgentQueueState): { label: string; className: string } {
  if (queue.active > 0) {
    return {
      label: `${queue.active} running`,
      className: 'border-green-500/40 bg-green-500/10 text-green-300',
    };
  }
  if (queue.queued > 0) {
    return {
      label: `${queue.queued} waiting`,
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    };
  }
  return {
    label: 'idle',
    className: 'border-subtle bg-bg-2 text-txt-3',
  };
}

function SubAgentCard({ queue, sharedQueue }: { queue: SubAgentQueueState; sharedQueue: boolean }) {
  const status = subAgentStatus(queue);
  return (
    <div className="rounded-card border border-strong bg-bg-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm text-txt">{queue.names.join(' + ')}</span>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-subtle bg-bg px-2 py-0.5 font-mono text-[10px] text-txt-3">
            {queue.queued} queued
          </span>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${status.className}`}>
            {status.label}
          </span>
        </div>
      </div>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-txt-3">
        {sharedQueue
          ? 'Shares one queue with the other sub-agent — they never run at the same time.'
          : 'Own queue (concurrency 1) — may run at the same time as the other sub-agent.'}
      </p>
    </div>
  );
}

export default function QueuePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subAgentQueuedLabels = data?.subAgents.flatMap((queue) => queue.queuedLabels) ?? [];
  const totalWaiting = data ? data.queued.length + subAgentQueuedLabels.length : 0;

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<QueueResponse>('/queue');
      setData(res);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
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
    <PageShell title="LLM queue" onRefresh={load}>
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] text-txt-3">
        {lastUpdated && <span>Last update: {lastUpdated.toLocaleTimeString()}</span>}
        <span>·</span>
        <span>auto-refresh {POLL_INTERVAL_MS / 1000}s</span>
      </div>

      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Provider mode" value={data.parallel ? 'Parallel' : 'Serialized'} />
            <StatCard label="LLM running" value={data.running.length} />
            <StatCard label="LLM waiting" value={totalWaiting} />
            <StatCard label="Grace period" value={`${data.backgroundGraceMs / 1000}s`} />
          </div>

          {/* {data.parallel ? (
            <div className="mb-4">
              <Card>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span>
                    <span className="font-mono">ai.parallel</span> is on — LLM calls run concurrently, so nothing queues
                    here. The Processor panel below shows all in-flight activity.
                  </span>
                </div>
              </Card>
            </div>
          ) : (
            <div className="mb-4">
              <Card>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>
                    <span className="font-mono">ai.parallel</span> is off — only one LLM call runs at a time.
                    Interactive calls (manager, executor) jump ahead of background work (summarizer, heartbeat).
                  </span>                </div>
              </Card>
            </div>
          )} */}

          <div className={`grid grid-cols-1 gap-4 ${data.parallel ? '' : 'lg:grid-cols-2'}`}>
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">
                Processor — LLM calls in flight ({data.running.length})
              </div>
              <Processor running={data.running} />
            </Card>

            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">
                Waiting — LLM calls queued ({totalWaiting})
              </div>
              <div className="flex flex-col gap-4">
                {!data.parallel &&
                  (data.queued.length === 0 ? (
                    <EmptyState text="Nothing waiting" />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.queued.map((task, index) => (
                        <TaskChip key={`${task.label}-${index}`} task={task} />
                      ))}
                    </div>
                  ))}
                {subAgentQueuedLabels.length > 0 && (
                  <div>
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-txt-3">
                      Sub-agent tasks enqueued ({subAgentQueuedLabels.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {subAgentQueuedLabels.map((label, index) => (
                        <TaskChip key={`sub-${label}-${index}`} task={{ label, priority: 0, eligible: true }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4">
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">How queueing works</div>
              <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-txt-2">
                <li>
                  <span className="font-mono">ai.parallel</span> controls the provider queue (Processor/Waiting above).
                  Off: one LLM call at a time. On: calls run concurrently.
                </li>
                <li>
                  <span className="font-mono">ai.subagents_parallel</span> controls the sub-agent queues. Off: heartbeat
                  and summarizer share one queue. On: each has its own.
                </li>
                <li>Sub-agents never run their own tasks concurrently — at most one task per queue at a time.</li>
              </ul>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}