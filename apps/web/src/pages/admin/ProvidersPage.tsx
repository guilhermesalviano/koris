import { useState } from 'react';
import { EmptyState, Toggle } from '../../components/AdminUI';
import { SaveStatus, SettingsGroup, SettingsSection, settingsButton, settingsInput } from '../../components/SettingsUI';
import { useAutoSave, useSaveCoordinator, useSaveStates } from '../../lib/config-save-context';
import { useProviders } from '../../lib/use-providers';
import { formatConnectionTestResult, type ConnectionTestResult } from '../../lib/use-settings-form';
import type { ProviderCatalogEntry, ProviderRole } from '../../lib/types';

type Role = ProviderRole | 'embed';
const ROLES: { key: Role; label: string; description: string }[] = [
  { key: 'manager', label: 'Manager', description: 'The model that leads your conversations and coordinates tools.' },
  { key: 'workers', label: 'Workers', description: 'The model used for background work, summaries, and scheduled tasks.' },
  { key: 'embed', label: 'Embeddings', description: 'Turn memories into vectors so your assistant can find relevant context.' },
];

export type ProviderDraft = {
  provider: string;
  model: string;
  apiToken: string;
  baseUrl: string;
  numCtx: string;
  enabled: boolean;
};

export function validateProviderDraft(value: ProviderDraft, embed: boolean): string | null {
  if (!value.provider) return 'Choose a provider.';
  if ((!embed || value.enabled) && !value.model.trim()) return 'Enter a model to activate this provider.';
  if (value.baseUrl.trim()) {
    try {
      const url = new URL(value.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return 'Use an HTTP or HTTPS base URL.';
    } catch { return 'Enter a valid base URL.'; }
  }
  if (!embed && value.numCtx.trim()) {
    const size = Number(value.numCtx);
    if (!Number.isInteger(size) || size < 512 || size > 131072) return 'Context size must be a whole number between 512 and 131072.';
  }
  return null;
}

export function buildProviderEditPatch(role: Role, value: ProviderDraft, baseline?: ProviderDraft) {
  const switched = value.provider !== baseline?.provider;
  const profile: Record<string, unknown> = { provider: value.provider };
  if (switched || value.model !== baseline?.model) profile.model = value.model.trim();
  if (switched || value.baseUrl !== baseline?.baseUrl) profile.base_url = value.baseUrl.trim();
  if (value.apiToken && (switched || value.apiToken !== baseline?.apiToken)) profile.api_token = value.apiToken;
  if (role === 'embed') {
    if (switched || value.enabled !== baseline?.enabled) profile.enabled = value.enabled;
  } else if (value.numCtx.trim() && (switched || value.numCtx !== baseline?.numCtx)) {
    profile.num_ctx = Number(value.numCtx);
  }
  return { ai: { [role]: profile } };
}

function ProviderEditor({ role }: { role: Role }) {
  const api = useProviders();
  const embed = role === 'embed';
  const active = api.active[role];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const initial: ProviderDraft = {
    provider: active.provider,
    model: active.model,
    apiToken: '',
    baseUrl: api.catalog.find((item) => item.name === active.provider)?.storedBaseUrl ?? active.baseUrl,
    numCtx: String(active.numCtx ?? api.defaultNumCtx),
    enabled: api.active.embed.enabled,
  };
  const draft = useAutoSave(`providers.${role}`, initial, async (value, baseline) => {
    const result = await api.patchSettings(buildProviderEditPatch(role, value, baseline));
    if (!result.ok) throw new Error(result.errors?.join(' ') ?? 'Could not update this provider.');
  }, (value) => validateProviderDraft(value, embed));
  const selected = api.catalog.find((item) => item.name === draft.value.provider);
  const choices = api.catalog.filter((item) => !embed || item.embeddings);

  function selectProvider(entry: ProviderCatalogEntry) {
    setTestResult(null);
    draft.update({
      provider: entry.name,
      model: embed ? (entry.name === api.active.embed.provider ? api.active.embed.model : '') : entry.model || entry.recommendedModel || '',
      baseUrl: entry.storedBaseUrl,
      apiToken: '',
      numCtx: String(entry.storedNumCtx ?? api.defaultNumCtx),
      enabled: true,
    }, true);
  }

  function edit(field: 'model' | 'apiToken' | 'baseUrl' | 'numCtx', value: string) {
    setTestResult(null);
    draft.update((previous) => ({ ...previous, [field]: value }));
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.test({ provider: draft.value.provider, baseUrl: draft.value.baseUrl || selected?.defaultBaseUrl || '', apiToken: draft.value.apiToken }));
    } finally { setTesting(false); }
  }

  return (
    <div className="space-y-4">
      <SettingsGroup title={ROLES.find((item) => item.key === role)!.label} description={ROLES.find((item) => item.key === role)!.description}>
        {embed && (
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-subtle pb-4">
            <span className="text-sm">Semantic memory</span>
            <Toggle checked={draft.value.enabled} disabled={!draft.value.provider} onChange={() => draft.update((value) => ({ ...value, enabled: !value.enabled }), true)} label="Enable semantic memory" />
          </div>
        )}
        <label htmlFor={`provider-${role}`} className="mb-2 block text-xs font-medium text-txt-2">Provider</label>
        <select id={`provider-${role}`} value={draft.value.provider} className={settingsInput} onChange={(event) => { const entry = choices.find((item) => item.name === event.target.value); if (entry) selectProvider(entry); }}>
          {!draft.value.provider && <option value="" disabled>Choose a provider</option>}
          {choices.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
        </select>
        <p className="mt-2 text-xs text-txt-2">Selecting a provider makes it active for this role.</p>
        {selected && (
          <div className="mt-5 space-y-4 border-t border-subtle pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`model-${role}`} className="mb-2 block text-xs font-medium text-txt-2">{embed ? 'Embedding model' : 'Model'}</label>
                <input id={`model-${role}`} value={draft.value.model} onChange={(event) => edit('model', event.target.value)} className={`${settingsInput} font-mono`} placeholder={embed ? 'Embedding model name' : selected.recommendedModel || 'Model name'} autoComplete="off" />
              </div>
              <div>
                <label htmlFor={`token-${role}`} className="mb-2 block text-xs font-medium text-txt-2">API token</label>
                <input id={`token-${role}`} type="password" value={draft.value.apiToken} onChange={(event) => edit('apiToken', event.target.value)} className={settingsInput} placeholder={selected.hasToken ? 'Stored securely · leave blank to keep' : 'Enter an API token if required'} autoComplete="off" />
              </div>
              {!embed && (
                <div>
                  <label htmlFor={`context-${role}`} className="mb-2 block text-xs font-medium text-txt-2">Context size</label>
                  <input id={`context-${role}`} type="number" min={512} max={131072} step={1} value={draft.value.numCtx} onChange={(event) => edit('numCtx', event.target.value)} className={settingsInput} placeholder={String(api.defaultNumCtx)} />
                  <p className="mt-2 text-xs text-txt-2">Maximum tokens per request. Blank keeps the saved value.</p>
                </div>
              )}
              <div className={embed ? 'sm:col-span-2' : ''}>
                <label htmlFor={`url-${role}`} className="mb-2 block text-xs font-medium text-txt-2">Base URL <span className="font-normal text-txt-3">· optional override</span></label>
                <input id={`url-${role}`} value={draft.value.baseUrl} onChange={(event) => edit('baseUrl', event.target.value)} className={`${settingsInput} font-mono`} placeholder={selected.defaultBaseUrl || 'http://localhost:11434'} autoComplete="off" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={testing || draft.state === 'invalid'} onClick={test} className={settingsButton}>{testing ? 'Testing…' : 'Test connection'}</button>
              {selected.apiKeyUrl && <a href={selected.apiKeyUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-2 hover:underline">Get API key ↗</a>}
              {selected.docsUrl && <a href={selected.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-2 hover:underline">Browse models ↗</a>}
            </div>
            {testResult && <p aria-live="polite" className={`text-xs ${testResult.ok ? 'text-emerald-500' : 'text-red-400'}`}>{formatConnectionTestResult(testResult)}</p>}
          </div>
        )}
        <SaveStatus {...draft} />
      </SettingsGroup>
      {!embed && api.active.manager.provider === api.active.workers.provider && draft.value.provider === api.active.manager.provider && (
        <p className="text-xs leading-relaxed text-txt-2">Manager and Workers share this provider. Model, credentials, and context size apply to both roles.</p>
      )}
    </div>
  );
}

export default function ProvidersPage() {
  const api = useProviders();
  const saves = useSaveCoordinator();
  const states = useSaveStates();
  const [role, setRole] = useState<Role>('manager');
  return (
    <SettingsSection title="Providers" description="Choose the intelligence behind your assistant.">
      {api.error && <EmptyState text={api.error} />}
      {api.loading ? <EmptyState text="Loading providers…" /> : (
        <div className="space-y-5">
          <div className="inline-flex max-w-full gap-1 rounded-xl border border-subtle bg-bg-3/50 p-1" role="group" aria-label="Provider role">
            {ROLES.map((item) => (
              <button key={item.key} type="button" aria-label={item.label} aria-pressed={role === item.key} onClick={() => { void saves.flush('providers.'); setRole(item.key); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:px-4 ${role === item.key ? 'bg-bg-2 text-txt shadow-sm ring-1 ring-inset ring-white/5' : 'text-txt-2 hover:text-txt'}`}>
                {item.label}
                {states.some((state) => state.key === `providers.${item.key}` && (state.state === 'invalid' || state.state === 'error')) && <span aria-label="Changes need attention" className="h-1.5 w-1.5 rounded-full bg-red-400" />}
              </button>
            ))}
          </div>
          <ProviderEditor key={role} role={role} />
        </div>
      )}
    </SettingsSection>
  );
}
