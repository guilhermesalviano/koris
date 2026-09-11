import { EmptyState } from '../../components/AdminUI';
import { SaveStatus, SettingsGroup, SettingsSection, settingsInput } from '../../components/SettingsUI';
import { postSettings, useAutoSave, useConfigSnapshot } from '../../lib/config-save-context';
import type { RuntimeSettings } from '../../lib/use-settings-form';
import type { SkillsMode } from '../../lib/types';

function SkillsForm({ settings }: { settings: RuntimeSettings }) {
  const mode = useAutoSave<SkillsMode>('skills.mode', settings.SKILLS?.MODE ?? 'auto', async (value) => { await postSettings({ skills: { mode: value } }); });
  const limit = useAutoSave('skills.limit', String(settings.SKILLS?.LIMIT ?? 10), async (value) => { await postSettings({ skills: { limit: Number(value) } }); }, (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? null : 'Enter a whole number greater than zero.');
  return (
    <div className="space-y-4">
      <SettingsGroup title="How skills are loaded" description="Choose when your assistant receives skill instructions.">
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Skill ingestion mode">
          {([
            ['auto', 'Automatic', 'Include enabled skills with every message.'],
            ['manual', 'On demand', 'Load a skill for one turn with /<skill-name>.'],
          ] as const).map(([value, label, description]) => (
            <button key={value} type="button" aria-pressed={mode.value === value} onClick={() => mode.update(value, true)} className={`rounded-xl border p-4 text-left transition-colors ${mode.value === value ? 'border-accent bg-accent-muted' : 'border-subtle bg-bg-3/40 hover:border-strong'}`}>
              <span className="flex items-center justify-between text-sm font-medium">{label}<span aria-hidden="true" className={mode.value === value ? 'text-accent-2' : 'text-txt-3'}>{mode.value === value ? '●' : '○'}</span></span>
              <span className="mt-2 block text-xs leading-relaxed text-txt-2">{description}</span>
            </button>
          ))}
        </div>
        <SaveStatus {...mode} />
      </SettingsGroup>
      {mode.value === 'auto' && (
        <SettingsGroup title="Skill limit" description="The maximum number of skills included with each message.">
          <label htmlFor="skills-limit" className="mb-2 block text-xs text-txt-2">Skills per turn</label>
          <input id="skills-limit" type="number" min={1} step={1} value={limit.value} onChange={(event) => limit.update(event.target.value)} className={`${settingsInput} max-w-32`} aria-invalid={limit.state === 'invalid'} />
          <SaveStatus {...limit} />
        </SettingsGroup>
      )}
      <p className="text-xs text-txt-2">Manage individual skills in Configuration → Plugins.</p>
    </div>
  );
}

export default function SkillsSettingsPage() {
  const { settings, error } = useConfigSnapshot();
  return (
    <SettingsSection title="Skills" description="Give your assistant the right knowledge at the right time.">
      {error ? <EmptyState text={error} /> : settings ? <SkillsForm settings={settings} /> : <EmptyState text="Loading settings…" />}
    </SettingsSection>
  );
}
