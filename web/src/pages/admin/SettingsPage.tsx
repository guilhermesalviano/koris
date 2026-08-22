import { PageShell, Card, EmptyState, useToast, Toast } from '../../components/AdminUI';
import { useSettingsForm } from '../../lib/use-settings-form';
import { ProviderStep } from '../setup/steps/ProviderStep';
import { ChannelsStep } from '../setup/steps/ChannelsStep';
import { SearchStep } from '../setup/steps/SearchStep';
import { DomainsStep } from '../setup/steps/DomainsStep';
import { PersonalInfoStep } from '../setup/steps/PersonalInfoStep';

export default function SettingsPage() {
  const api = useSettingsForm();
  const [toastMsg, showToast, isError] = useToast();

  async function handleSave() {
    const ok = await api.submit();
    showToast(ok ? 'Settings saved' : (api.saveErrors?.[0] ?? 'Failed to save settings'), !ok);
  }

  return (
    <PageShell title="Settings" description="Runtime configuration" onRefresh={api.reload}>
      {api.loadError && <EmptyState text={api.loadError} />}
      {api.loading && !api.loadError && <EmptyState text="Loading…" />}
      {!api.loading && !api.loadError && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-medium">AI provider</h2>
            <ProviderStep api={api} />
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Channels</h2>
            <ChannelsStep api={api} />
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Web search</h2>
            <SearchStep api={api} />
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Allowed domains</h2>
            <DomainsStep api={api} />
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Personal info</h2>
            <PersonalInfoStep api={api} />
          </Card>

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
