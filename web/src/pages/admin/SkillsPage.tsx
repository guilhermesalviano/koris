import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { SkillsResponse } from '../../lib/types';

export default function SkillsPage() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function deleteSkill(name: string) {
    try {
      await apiRequest(`/skills/learned/${encodeURIComponent(name)}`, { method: 'DELETE' });
      showToast('Skill removed');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    }
  }

  return (
    <PageShell title="Skills" onRefresh={load}>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Available skills</div>
            {data.available.length === 0 && <EmptyState text="No skills found." />}
            {data.available.map((s) => (
              <div key={s.name} className="mb-2 rounded-lg border border-subtle bg-bg-3 px-3 py-2.5">
                <div className="font-mono text-xs text-accent-2">{s.name}</div>
                <div className="mt-1 text-sm text-txt-2">{s.description}</div>
              </div>
            ))}
          </Card>
          <Card>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Learned skills</div>
            {data.learned.length === 0 && <EmptyState text="No learned skills yet." />}
            {data.learned.map((s) => (
              <div key={s.id} className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-subtle bg-bg-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-accent-2">{s.skill_name}</div>
                  <div className="mt-1 font-mono text-[10px] text-txt-3">{formatDate(s.learned_at)}</div>
                </div>
                <button
                  onClick={() => deleteSkill(s.skill_name)}
                  className="flex-shrink-0 rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
