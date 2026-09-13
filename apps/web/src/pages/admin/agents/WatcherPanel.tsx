import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, PageShell, formatDate } from '../../../components/AdminUI';
import { Badge, Button } from '../../../components/ui';
import { apiRequest } from '../../../lib/api';
import { useUi } from '../../../lib/ui-context';
import type { AuditItem, AuditResponse, HeartbeatItem, HeartbeatsResponse } from '../../../lib/types';
import { TYPE_META, cronToLabel, friendlyDate } from '../HeartbeatsPage';

const RECENT_RUNS = 20;

function typeLabel(type: string): string {
  return TYPE_META[type as keyof typeof TYPE_META]?.label ?? type;
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function BeatCard({ beat, now }: { beat: HeartbeatItem; now?: Date }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={beat.type === 'reminder' ? 'info' : 'accent'}>{typeLabel(beat.type)}</Badge>
        <span className="font-mono text-micro text-txt-3">{cronToLabel(beat.cron_expression)}</span>
        {beat.run_once && <Badge>once</Badge>}
        {beat.channel && (
          <span className="ml-auto font-mono text-micro text-txt-3">
            → {beat.channel}{beat.target ? ` · ${beat.target}` : ''}
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-body text-txt">{beat.beat}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-micro text-txt-3">
        <span>Last run: <span className="text-txt-2">{friendlyDate(beat.last_run, now)}</span></span>
        <span>Next run: <span className="text-txt-2">{friendlyDate(beat.next_run, now)}</span></span>
      </div>
    </Card>
  );
}

/** One audit row the Watcher produced — its run id is the beat's id. */
export function RunRow({ run, beat }: { run: AuditItem; beat?: HeartbeatItem }) {
  const failed = run.status === 'error';
  const what = run.type === 'tool' ? `tool ${run.toolName ?? ''}`.trim() : run.model ? `llm ${run.model}` : 'llm';
  const detail = failed ? run.errorMessage ?? run.errorCode : run.responsePreview;

  return (
    <li className="flex flex-col gap-1 border-b border-subtle px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={failed ? 'danger' : 'success'} dot>{failed ? 'error' : 'ok'}</Badge>
        <span className="min-w-0 truncate text-caption text-txt">
          {beat ? truncate(beat.beat) : run.runId ? `beat ${run.runId.slice(0, 8)}…` : 'beat'}
        </span>
        <span className="ml-auto font-mono text-micro text-txt-3">{formatDate(run.createdAt)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 font-mono text-micro text-txt-3">
        <span>{what}</span>
        <span>{run.durationMs} ms</span>
      </div>
      {detail && (
        <p className={`line-clamp-2 text-caption ${failed ? 'text-danger' : 'text-txt-2'}`}>{detail}</p>
      )}
    </li>
  );
}

/**
 * The Watcher's panel: the beats it runs on a schedule and what its recent runs
 * did. Read-only — beats are created and deleted in Configuration → Beats.
 */
export default function WatcherPanel() {
  const { openConfig } = useUi();
  const [beats, setBeats] = useState<HeartbeatItem[] | null>(null);
  const [runs, setRuns] = useState<AuditItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [beatsRes, runsRes] = await Promise.all([
        apiRequest<HeartbeatsResponse>('/heartbeats'),
        apiRequest<AuditResponse>(`/audit?agentName=heartbeat&limit=${RECENT_RUNS}`),
      ]);
      setBeats(beatsRes.items);
      setRuns(runsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the Watcher');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beatsById = useMemo(() => new Map((beats ?? []).map((beat) => [beat.id, beat])), [beats]);

  return (
    <PageShell
      title="Watcher (Heartbeat)"
      description="Scheduled beats and what their recent runs did"
      onRefresh={() => void load()}
      actions={<Button size="sm" variant="ghost" onClick={() => openConfig('beats')}>Manage beats</Button>}
    >
      {error && <EmptyState text={error} action={<Button size="sm" onClick={() => void load()}>Retry</Button>} />}
      {!error && (beats === null || runs === null) && <EmptyState text="Loading…" />}
      {!error && beats !== null && runs !== null && (
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <section aria-labelledby="watcher-beats">
            <h2 id="watcher-beats" className="mb-3 font-mono text-micro uppercase text-txt-3">
              Beats ({beats.length})
            </h2>
            {beats.length === 0 ? (
              <EmptyState
                text="No beats scheduled."
                action={<Button size="sm" onClick={() => openConfig('beats')}>Create a beat</Button>}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {beats.map((beat) => <BeatCard key={beat.id} beat={beat} />)}
              </div>
            )}
          </section>

          <section aria-labelledby="watcher-runs">
            <h2 id="watcher-runs" className="mb-3 font-mono text-micro uppercase text-txt-3">Recent runs</h2>
            {runs.length === 0 ? (
              <EmptyState text="No runs recorded yet." />
            ) : (
              <Card className="p-0">
                <ul>
                  {runs.map((run) => (
                    <RunRow key={run.id} run={run} beat={run.runId ? beatsById.get(run.runId) : undefined} />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
