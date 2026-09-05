import { PageShell, Card, EmptyState, useToast, Toast } from '../../components/AdminUI';
import { useSettingsForm, buildSkillsPatch } from '../../lib/use-settings-form';
import type { SkillsMode } from '../../lib/types';

export default function SkillsSettingsPage() {
  const api = useSettingsForm();
  const [toastMsg, showToast, isError] = useToast();

  async function handleSave() {
    const ok = await api.submit(buildSkillsPatch(api.form));
    showToast(ok ? 'Settings saved' : (api.saveErrors?.[0] ?? 'Failed to save settings'), !ok);
  }

  function setMode(mode: SkillsMode) {
    api.update((prev) => ({ ...prev, skills_mode: mode }));
  }

  return (
    <PageShell title="Skills" description="How skill documentation reaches the model" onRefresh={api.reload}>
      {api.loadError && <EmptyState text={api.loadError} />}
      {api.loading && !api.loadError && <EmptyState text="Loading…" />}
      {!api.loading && !api.loadError && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-medium">Ingestion mode</h2>
            <div className="flex flex-wrap gap-2">
              <ModeOption
                label="Auto"
                hint="Every enabled skill's full instructions ride along in each message."
                active={api.form.skills_mode === 'auto'}
                onSelect={() => setMode('auto')}
              />
              <ModeOption
                label="Manual"
                hint="Only names and descriptions. Load one for a turn with /<skill-name>."
                active={api.form.skills_mode === 'manual'}
                onSelect={() => setMode('manual')}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-medium">Limit</h2>
            <p className="mb-3 text-xs text-txt-3">
              Most skills surfaced to the model at once. In auto mode this caps how many full
              bodies are injected; in manual mode, how many are listed and callable.
            </p>
            <input
              type="number"
              min={1}
              value={api.form.skills_limit}
              onChange={(e) => api.update((prev) => ({ ...prev, skills_limit: e.target.value }))}
              className="w-28 rounded-lg border border-subtle bg-bg-3 px-3 py-1.5 text-sm"
            />
          </Card>

          <p className="text-xs text-txt-3">
            Enable or disable individual skills in the Plugins panel.
          </p>

          {api.saveErrors && (
            <div className="rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-3 text-sm text-red-300">
              {api.saveErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <button
            type="button"
            disabled={api.saving}
            onClick={handleSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {api.saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}

function ModeOption({
  label,
  hint,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex-1 basis-64 rounded-lg border px-3 py-2 text-left ${
        active
          ? 'border-accent bg-accent/10'
          : 'border-subtle bg-bg-3 hover:border-accent hover:bg-bg-3'
      }`}
    >
      <div className={`font-mono text-[11px] uppercase tracking-wide ${active ? 'text-accent-2' : 'text-txt-2'}`}>
        {label}
        {active && ' · selected'}
      </div>
      <div className="mt-1 text-xs text-txt-3">{hint}</div>
    </button>
  );
}
