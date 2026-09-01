import { useState } from 'react';
import { PageShell, Card, EmptyState, useToast, Toast } from '../../components/AdminUI';
import { useProviders } from '../../lib/use-providers';
import type { ProviderCatalogEntry, ProviderRole } from '../../lib/types';
import { formatConnectionTestResult, type ConnectionTestResult } from '../../lib/use-settings-form';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';
const primaryBtn = 'rounded-lg bg-accent px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60';

// The Providers modal has its own tab-key union — `embed` is NOT an `ai.roles`
// entry, it drives the separate `ai.embed` pointer.
type TabKey = ProviderRole | 'embed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'workers', label: 'Workers' },
  { key: 'embed', label: 'Embeddings' },
];

const DEFAULT_PROVIDERS = ['ollama'];
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

interface FormState {
  model: string;
  apiToken: string;
  baseUrl: string;
  showAdvanced: boolean;
}

export default function ProvidersPage() {
  const api = useProviders();
  const [toastMsg, showToast, isError] = useToast();
  const [tab, setTab] = useState<TabKey>('manager');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ model: '', apiToken: '', baseUrl: '', showAdvanced: false });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const isEmbedTab = tab === 'embed';
  const active = isEmbedTab ? api.active.embed : api.active[tab];
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? tab;

  const visible = api.catalog.filter(
    (e) => DEFAULT_PROVIDERS.includes(e.name) || e.configured || added.includes(e.name),
  );
  const addable = api.catalog.filter((e) => !visible.some((v) => v.name === e.name));

  function isCurrent(entry: ProviderCatalogEntry): boolean {
    return active.provider === entry.name;
  }

  function embedModelFor(entry: ProviderCatalogEntry): string {
    if (api.active.embed.provider === entry.name && api.active.embed.model) return api.active.embed.model;
    return entry.model || DEFAULT_EMBED_MODEL;
  }

  function seedModel(entry: ProviderCatalogEntry): string {
    if (isCurrent(entry)) return active.model;
    if (isEmbedTab) return entry.model || DEFAULT_EMBED_MODEL;
    return entry.model || entry.recommendedModel || '';
  }

  function openProvider(entry: ProviderCatalogEntry) {
    setExpanded(entry.name);
    setTestResult(null);
    setForm({
      model: seedModel(entry),
      apiToken: '',
      baseUrl: isCurrent(entry) && active.baseUrl ? active.baseUrl : '',
      showAdvanced: false,
    });
  }

  function switchTab(next: TabKey) {
    setTab(next);
    setExpanded(null);
    setTestResult(null);
  }

  async function runTest(entry: ProviderCatalogEntry) {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.test({
        provider: entry.name,
        baseUrl: form.baseUrl || entry.defaultBaseUrl || '',
        apiToken: form.apiToken,
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  function formInput(entry: ProviderCatalogEntry) {
    return {
      provider: entry.name,
      model: form.model.trim(),
      apiToken: form.apiToken,
      baseUrl: form.baseUrl.trim(),
    };
  }

  async function save(entry: ProviderCatalogEntry) {
    setSaving(true);
    try {
      const res = isEmbedTab
        ? await api.setEmbed({
            enabled: api.active.embed.enabled,
            provider: entry.name,
            model: form.model.trim() || DEFAULT_EMBED_MODEL,
            apiToken: form.apiToken,
          })
        : await api.saveProvider(formInput(entry));
      if (res.ok) {
        showToast(`${entry.label} saved`);
      } else {
        showToast(res.errors?.[0] ?? 'Failed to save provider', true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function activate(entry: ProviderCatalogEntry, model?: string) {
    setActivating(true);
    try {
      const res = isEmbedTab
        ? await api.setEmbed({
            enabled: true,
            provider: entry.name,
            model: model ?? embedModelFor(entry),
            apiToken: '',
          })
        : await api.activate(tab, {
            provider: entry.name,
            model: model ?? (isCurrent(entry) ? active.model : entry.model || entry.recommendedModel || ''),
            apiToken: '',
            baseUrl: isCurrent(entry) ? active.baseUrl : entry.storedBaseUrl || '',
          });
      if (res.ok) {
        showToast(isEmbedTab ? `${entry.label} used for embeddings` : `${entry.label} set as ${tabLabel}`);
        setExpanded(null);
      } else {
        showToast(res.errors?.[0] ?? 'Failed to activate provider', true);
      }
    } finally {
      setActivating(false);
    }
  }

  async function toggleEmbedEnabled() {
    if (!api.active.embed.provider) return;
    setActivating(true);
    try {
      const res = await api.setEmbed({
        enabled: !api.active.embed.enabled,
        provider: api.active.embed.provider,
        model: api.active.embed.model || DEFAULT_EMBED_MODEL,
        apiToken: '',
      });
      if (!res.ok) showToast(res.errors?.[0] ?? 'Failed to update embeddings', true);
    } finally {
      setActivating(false);
    }
  }

  const headerActionLabel = isEmbedTab ? 'Use for embeddings' : `Set as ${tabLabel}`;
  const headerActiveLabel = 'In use';

  return (
    <PageShell title="Providers" description="Choose an LLM provider" onRefresh={api.reload}>
      {api.error && <EmptyState text={api.error} />}
      {api.loading && !api.error && <EmptyState text="Loading…" />}

      {!api.loading && !api.error && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={
                  tab === t.key
                    ? 'rounded-lg border border-accent-muted bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent-2'
                    : `${secondaryBtn} py-1.5`
                }
              >
                {t.label}
              </button>
            ))}
            <span className="ml-1 font-mono text-[11px] text-txt-3">
              active: {active.provider || '—'}{active.model ? ` · ${active.model}` : ''}
            </span>
          </div>

          {isEmbedTab && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[11px] text-txt-3">
                Embeddings power semantic memory — point them at an embeddings-capable provider.
              </p>
              <button
                type="button"
                disabled={activating || !api.active.embed.provider}
                onClick={toggleEmbedEnabled}
                className={`${secondaryBtn} py-1`}
              >
                {api.active.embed.enabled ? 'Disable embeddings' : 'Enable embeddings'}
              </button>
            </div>
          )}

          <div className="space-y-3">
            {visible.map((entry) => {
              const current = isCurrent(entry);
              const isOpen = expanded === entry.name;
              return (
                <Card key={entry.name}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{entry.label}</span>
                        {current && (
                          <span className="rounded bg-accent-muted px-1.5 py-0.5 font-mono text-[10px] text-accent-2">
                            {isEmbedTab ? 'embeddings' : 'active'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-txt-3">
                        {entry.defaultBaseUrl ?? 'custom base URL required'}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px] text-txt-3">
                        <span className="rounded border border-subtle px-1.5 py-0.5">
                          {entry.isOpenAICompatible ? 'OpenAI-compatible' : 'native'}
                        </span>
                        {!entry.defaultBaseUrl && (
                          <span className="rounded border border-subtle px-1.5 py-0.5">local</span>
                        )}
                        {!entry.embeddings && (
                          <span className="rounded border border-subtle px-1.5 py-0.5">no embeddings</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[11px]">
                        {entry.apiKeyUrl && (
                          <a href={entry.apiKeyUrl} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">
                            API key ↗
                          </a>
                        )}
                        {entry.docsUrl && (
                          <a href={entry.docsUrl} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">
                            Models ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={activating || saving || current}
                        onClick={() => activate(entry)}
                        className={current ? `${secondaryBtn} py-1.5` : primaryBtn}
                      >
                        {activating ? 'Setting…' : current ? headerActiveLabel : headerActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => (isOpen ? setExpanded(null) : openProvider(entry))}
                        className={`${secondaryBtn} py-1.5`}
                      >
                        {isOpen ? 'Close' : entry.configured ? 'Reconfigure' : 'Configure'}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-subtle pt-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>{isEmbedTab ? 'Embedding model' : 'Model'}</label>
                        <input
                          value={form.model}
                          onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                          className={`${inputClass} font-mono`}
                          name="model"
                          autoComplete="off"
                          placeholder={isEmbedTab ? DEFAULT_EMBED_MODEL : entry.recommendedModel ?? ''}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>API token</label>
                        <input
                          type="password"
                          value={form.apiToken}
                          onChange={(e) => setForm((p) => ({ ...p, apiToken: e.target.value }))}
                          className={`${inputClass} font-mono`}
                          name="api-token"
                          autoComplete="off"
                          placeholder={
                            current && active.hasToken
                              ? 'Leave blank to keep current token'
                              : entry.defaultBaseUrl
                                ? 'Required'
                                : 'Only required by some providers'
                          }
                        />
                      </div>

                      {!isEmbedTab && (
                        <div className="sm:col-span-2">
                          {form.showAdvanced ? (
                            <div>
                              <label className={labelClass}>Base URL override</label>
                              <input
                                value={form.baseUrl}
                                onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
                                className={`${inputClass} font-mono`}
                                name="provider-url"
                                placeholder={entry.defaultBaseUrl ?? 'http://localhost:11434'}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setForm((p) => ({ ...p, showAdvanced: true }))}
                              className="font-mono text-[11px] text-txt-3 hover:text-accent-2"
                            >
                              Advanced: override base URL
                            </button>
                          )}
                        </div>
                      )}

                      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={testing}
                          onClick={() => runTest(entry)}
                          className={`${secondaryBtn} py-1.5`}
                        >
                          {testing ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          type="button"
                          disabled={saving || activating || !form.model.trim()}
                          onClick={() => save(entry)}
                          className={`${secondaryBtn} py-1.5`}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        {testResult && (
                          <span className={`font-mono text-[11px] ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                            {formatConnectionTestResult(testResult)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {addable.length > 0 && (
            <Card>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Add provider</span>
                <span className="font-mono text-[11px] text-txt-3">not shown by default</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {addable.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => setAdded((p) => [...p, entry.name])}
                    className={`${secondaryBtn} py-1.5`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
