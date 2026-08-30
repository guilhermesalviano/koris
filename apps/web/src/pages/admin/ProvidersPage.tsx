import { useState } from 'react';
import { PageShell, Card, EmptyState, useToast, Toast } from '../../components/AdminUI';
import { useProviders } from '../../lib/use-providers';
import type { ProviderCatalogEntry, ProviderRole } from '../../lib/types';
import { formatConnectionTestResult, type ConnectionTestResult } from '../../lib/use-settings-form';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';
const primaryBtn = 'rounded-lg bg-accent px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60';

const ROLES: { key: ProviderRole; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'workers', label: 'Workers' },
];

const DEFAULT_PROVIDERS = ['ollama'];

interface FormState {
  model: string;
  apiToken: string;
  baseUrl: string;
  showAdvanced: boolean;
}

export default function ProvidersPage() {
  const api = useProviders();
  const [toastMsg, showToast, isError] = useToast();
  const [role, setRole] = useState<ProviderRole>('manager');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ model: '', apiToken: '', baseUrl: '', showAdvanced: false });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [activating, setActivating] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const active = api.active[role];

  const visible = api.catalog.filter(
    (e) => DEFAULT_PROVIDERS.includes(e.name) || e.configured || added.includes(e.name),
  );
  const addable = api.catalog.filter((e) => !visible.some((v) => v.name === e.name));

  function openProvider(entry: ProviderCatalogEntry) {
    const isActive = active.provider === entry.name;
    setExpanded(entry.name);
    setTestResult(null);
    setForm({
      model: isActive ? active.model : (entry.recommendedModel ?? ''),
      apiToken: '',
      baseUrl: isActive && active.baseUrl ? active.baseUrl : '',
      showAdvanced: false,
    });
  }

  function switchRole(next: ProviderRole) {
    setRole(next);
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

  async function activate(entry: ProviderCatalogEntry) {
    setActivating(true);
    try {
      const res = await api.activate(role, {
        provider: entry.name,
        model: form.model.trim(),
        apiToken: form.apiToken,
        baseUrl: form.baseUrl.trim(),
      });
      if (res.ok) {
        showToast(`${entry.label} activated for ${role}`);
        setExpanded(null);
      } else {
        showToast(res.errors?.[0] ?? 'Failed to activate provider', true);
      }
    } finally {
      setActivating(false);
    }
  }

  return (
    <PageShell title="Providers" description="Choose an LLM provider" onRefresh={api.reload}>
      {api.error && <EmptyState text={api.error} />}
      {api.loading && !api.error && <EmptyState text="Loading…" />}

      {!api.loading && !api.error && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => switchRole(r.key)}
                className={
                  role === r.key
                    ? 'rounded-lg border border-accent-muted bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent-2'
                    : `${secondaryBtn} py-1.5`
                }
              >
                {r.label}
              </button>
            ))}
            <span className="ml-1 font-mono text-[11px] text-txt-3">
              active: {active.provider || '—'}{active.model ? ` · ${active.model}` : ''}
            </span>
          </div>

          {role === 'workers' && (
            <p className="font-mono text-[11px] text-txt-3">
              Workers handles summarisation &amp; embeddings — prefer an embeddings-capable provider.
            </p>
          )}

          <div className="space-y-3">
            {visible.map((entry) => {
              const isActive = active.provider === entry.name;
              const isOpen = expanded === entry.name;
              return (
                <Card key={entry.name}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{entry.label}</span>
                        {isActive && (
                          <span className="rounded bg-accent-muted px-1.5 py-0.5 font-mono text-[10px] text-accent-2">active</span>
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
                    <button
                      type="button"
                      onClick={() => (isOpen ? setExpanded(null) : openProvider(entry))}
                      className={`${secondaryBtn} flex-shrink-0 py-1.5`}
                    >
                      {isOpen ? 'Close' : entry.configured ? 'Reconfigure' : 'Configure'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-subtle pt-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Model</label>
                        <input
                          value={form.model}
                          onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                          className={`${inputClass} font-mono`}
                          name="model"
                          autoComplete="off"
                          placeholder={entry.recommendedModel ?? ''}
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
                            isActive && active.hasToken
                              ? 'Leave blank to keep current token'
                              : entry.defaultBaseUrl
                                ? 'Required'
                                : 'Only required by some providers'
                          }
                        />
                      </div>

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
                          disabled={activating || !form.model.trim()}
                          onClick={() => activate(entry)}
                          className={primaryBtn}
                        >
                          {activating ? 'Activating…' : `Activate for ${role}`}
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
