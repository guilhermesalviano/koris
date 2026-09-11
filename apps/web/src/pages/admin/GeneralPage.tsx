import { EmptyState } from '../../components/AdminUI';
import { SaveStatus, SettingsGroup, SettingsSection, settingsButton, settingsInput } from '../../components/SettingsUI';
import { MoonIcon, SunIcon } from '../../components/Icons';
import { postSettings, useAutoSave, useConfigSnapshot } from '../../lib/config-save-context';
import { useUi } from '../../lib/ui-context';
import type { RuntimeSettings } from '../../lib/use-settings-form';

type PersonalEntry = {
  id: string;
  key: string;
  value: string;
};

function GeneralForm({ settings }: { settings: RuntimeSettings }) {
  const domains = useAutoSave('general.domains', (settings.ALLOWED_DOMAINS ?? []).join('\n'), async (text) => {
    await postSettings({ allowed_domains: text.split(/[\n,]/).map((value) => value.trim().toLowerCase()).filter(Boolean) });
  });
  const personal = useAutoSave<PersonalEntry[]>(
    'general.personal',
    Object.entries(settings.PERSONAL_INFORMATION ?? {}).map(([key, value]) => ({ id: key, key, value })),
    async (entries) => {
      await postSettings({ personal_information: Object.fromEntries(entries.filter((entry) => entry.key.trim()).map((entry) => [entry.key.trim(), entry.value])) });
    },
    (entries) => {
      const keys = entries.map((entry) => entry.key.trim());
      if (entries.some((entry) => !entry.key.trim() && entry.value.trim())) return 'Give each field a name.';
      if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) return 'Use a different name for each field.';
      return null;
    },
  );

  const { isDark, toggleTheme } = useUi();

  return (
    <div className="space-y-4">
      <SettingsGroup title="Appearance" description="Choose your preferred color scheme.">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { if (isDark) toggleTheme(); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium transition-colors ${
              !isDark
                ? 'border-accent bg-accent/10 text-accent-2'
                : 'border-strong bg-bg-3/60 text-txt-2 hover:border-accent hover:text-txt'
            }`}
          >
            <SunIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
            Light
          </button>
          <button
            type="button"
            onClick={() => { if (!isDark) toggleTheme(); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-medium transition-colors ${
              isDark
                ? 'border-accent bg-accent/10 text-accent-2'
                : 'border-strong bg-bg-3/60 text-txt-2 hover:border-accent hover:text-txt'
            }`}
          >
            <MoonIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
            Dark
          </button>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Allowed domains" description="Choose which websites your assistant can reach. Leave empty to deny outbound requests.">
        <label htmlFor="allowed-domains" className="mb-2 block text-xs text-txt-2">One domain per line</label>
        <textarea id="allowed-domains" rows={5} value={domains.value} onChange={(event) => domains.update(event.target.value)} placeholder={'example.com\napi.example.com'} className={`${settingsInput} resize-y font-mono`} />
        <SaveStatus {...domains} />
      </SettingsGroup>
      <SettingsGroup title="Personal context" description="A few details to help your assistant give more relevant answers.">
        <div className="space-y-3">
          {personal.value.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-2">
              <input aria-label="Field name" value={entry.key} placeholder="Name, location, preferences…" className={`${settingsInput} min-w-0 flex-1 basis-36`} onChange={(event) => personal.update((entries) => entries.map((row) => row.id === entry.id ? { ...row, key: event.target.value } : row))} />
              <input aria-label={`Value for ${entry.key || 'new field'}`} value={entry.value} placeholder="Your details" className={`${settingsInput} min-w-0 flex-1 basis-44`} onChange={(event) => personal.update((entries) => entries.map((row) => row.id === entry.id ? { ...row, value: event.target.value } : row))} />
              <button type="button" aria-label={`Remove ${entry.key || 'field'}`} className={`${settingsButton} hover:!text-red-400`} onClick={() => personal.update((entries) => entries.filter((row) => row.id !== entry.id), true)}>Remove</button>
            </div>
          ))}
          <button type="button" className={settingsButton} onClick={() => personal.update((entries) => [...entries, { id: crypto.randomUUID(), key: '', value: '' }])}>+ Add field</button>
        </div>
        <SaveStatus {...personal} />
      </SettingsGroup>
    </div>
  );
}

export default function GeneralPage() {
  const { settings, error } = useConfigSnapshot();
  return (
    <SettingsSection title="General" description="Make your assistant feel more like yours.">
      {error ? <EmptyState text={error} /> : settings ? <GeneralForm settings={settings} /> : <EmptyState text="Loading settings…" />}
    </SettingsSection>
  );
}
