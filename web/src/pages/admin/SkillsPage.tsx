import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { SkillItem, SkillsResponse } from '../../lib/types';

export default function SkillsPage() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<SkillsResponse>('/skills');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleSkill(skill: SkillItem) {
    try {
      await apiRequest(`/skills/${encodeURIComponent(skill.name)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      showToast(skill.enabled ? `"${skill.name}" disabled` : `"${skill.name}" enabled`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', true);
    }
  }

  async function resync() {
    setResyncing(true);
    try {
      await apiRequest('/skills/sync', { method: 'POST' });
      showToast('Skills resynced');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resync failed', true);
    } finally {
      setResyncing(false);
    }
  }

  const enabledCount = data?.items.filter((s) => s.enabled).length ?? 0;
  const inContext = data ? Math.min(enabledCount, data.limit) : 0;

  return (
    <PageShell title="Skills" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">
                {data.items.length} skill{data.items.length === 1 ? '' : 's'} · {enabledCount} enabled · {inContext} in LLM context (limit {data.limit})
              </div>
              <button
                onClick={resync}
                disabled={resyncing}
                className="ml-auto rounded-lg border border-subtle bg-bg-3 px-3 py-1.5 font-mono text-[11px] text-txt-2 hover:border-accent hover:text-accent-2 disabled:opacity-50"
              >
                {resyncing ? 'Resyncing…' : 'Resync from disk'}
              </button>
            </div>
          </Card>

          <div className="mt-4 space-y-2">
            {data.items.length === 0 && (
              <Card>
                <EmptyState text="No skills found. Add a skills/<name>/SKILL.md folder to get started." />
              </Card>
            )}
            {data.items.map((skill) => (
              <SkillCard key={skill.name} skill={skill} onToggle={() => toggleSkill(skill)} />
            ))}
          </div>
        </>
      )}
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}

function SkillCard({ skill, onToggle }: { skill: SkillItem; onToggle: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-accent-2">{skill.name}</span>
            {skill.enabled ? (
              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] text-green-300">
                enabled
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                disabled
              </span>
            )}
            {skill.learned_at && (
              <span className="font-mono text-[10px] text-txt-3">synced {formatDate(skill.learned_at)}</span>
            )}
          </div>
          <div className="mt-1 text-sm text-txt-2">{skill.description}</div>
          {skill.read_when && skill.read_when.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {skill.read_when.map((hint) => (
                <span
                  key={hint}
                  className="rounded-full border border-subtle bg-bg px-2 py-0.5 font-mono text-[10px] text-txt-3"
                >
                  {hint}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="flex-shrink-0 rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-accent hover:text-accent-2"
        >
          {skill.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      {skill.content && (
        <details className="mt-3 rounded-lg border border-subtle bg-bg-3">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-txt-3 hover:text-txt-2">
            Preview
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-relaxed text-txt-2">
            {skill.content}
          </pre>
        </details>
      )}
    </Card>
  );
}