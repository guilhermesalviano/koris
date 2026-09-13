import { useMemo } from 'react';
import { Card } from '../../../components/AdminUI';
import { Badge, Button } from '../../../components/ui';
import { ReadOnlyAgentChat } from '../../../components/chat/ReadOnlyAgentChat';
import { buildWatcherChat } from '../../../lib/subagent-chat';
import { useAgentActivity } from '../../../lib/agent-activity-context';
import { useUi } from '../../../lib/ui-context';
import type { HeartbeatItem } from '../../../lib/types';
import { TYPE_META, cronToLabel, friendlyDate } from '../HeartbeatsPage';

function typeLabel(type: string): string {
  return TYPE_META[type as keyof typeof TYPE_META]?.label ?? type;
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

export default function WatcherPanel() {
  const { openConfig } = useUi();
  const { watcher: { data, loading, error, refresh } } = useAgentActivity();
  const entries = useMemo(() => buildWatcherChat(data ?? { beats: [], runs: [] }), [data]);

  return (
    <ReadOnlyAgentChat
      agentId="watcher"
      title="Watcher (Heartbeat)"
      entries={entries}
      loading={loading}
      loaded={data !== null}
      error={error}
      onRefresh={() => void refresh()}
      emptyText="No runs recorded yet. Scheduled task activity will appear here."
      historyLabel="Latest 20 recorded Watcher activities"
      actions={<Button size="sm" variant="ghost" onClick={() => openConfig('beats')}>Manage beats</Button>}
    >
      {data && (
        <details className="rounded-card border border-subtle bg-bg-2 p-3">
          <summary className="cursor-pointer text-caption text-txt-2">Scheduled beats ({data.beats.length})</summary>
          <div className="mt-3 flex flex-col gap-3">
            {data.beats.length === 0 ? <p className="text-caption text-txt-3">No beats scheduled.</p> : data.beats.map((beat) => <BeatCard key={beat.id} beat={beat} />)}
          </div>
        </details>
      )}
    </ReadOnlyAgentChat>
  );
}
