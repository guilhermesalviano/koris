import { useState } from 'react';
import { PageShell, Card, EmptyState, useToast, Toast } from '../../components/AdminUI';
import { useConnectors } from '../../lib/use-connectors';
import type { ConnectorCatalogEntry, ConnectorRole } from '../../lib/types';
import type { ConnectionTestResult } from '../../lib/use-settings-form';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';
const primaryBtn = 'rounded-lg bg-accent px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60';

const ROLES: { key: ConnectorRole; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'workers', label: 'Workers' },
];

interface FormState {
  model: string;
  apiToken: string;
  baseUrl: string;
  showAdvanced: boolean;
}

function testResultText(result: ConnectionTestResult): string {
  if (result.ok) {
    return result.skipped
      ? 'mock provider — no check needed'
      : `reachable${result.detail ? ` (v${result.detail})` : ''}`;
  }
  return result.authFailed
    ? `auth failed (HTTP ${result.status})`
    : (result.error ?? `HTTP ${result.status}`);
}

export default function ConnectorsPage() {
  const api = useConnectors();
  const [toastMsg, showToast, isError] = useToast();
  const [role, setRole] = useState<ConnectorRole>('manager');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ model: '', apiToken: '', baseUrl: '', showAdvanced: false });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [activating, setActivating] = useState(false);

  const active = api.active[role];

  function openConnector(entry: ConnectorCatalogEntry) {
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

  function switchRole(next: ConnectorRole) {
    setRole(next);
    setExpanded(null);
    setTestResult(null);
  }

  async function runTest(entry: ConnectorCatalogEntry) {
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

  async function activate(entry: ConnectorCatalogEntry) {
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
        showToast(res.errors?.[0] ?? 'Failed to activate connector', true);
      }
    } finally {
      setActivating(false);
    }
  }

  return (
    <PageShell title="Connectors" description="Choose an LLM provider" onRefresh={api.reload}>
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
              Workers handles summarisation &amp; embeddings — prefer an embeddings-capable connector.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {api.catalog.map((entry) => {
              const isActive = active.provider === entry.name;
              const isOpen = expanded === entry.name;
              return (
                <Card key={entry.name} className={isOpen ? 'sm:col-span-2' : ''}>
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
                      onClick={() => (isOpen ? setExpanded(null) : openConnector(entry))}
                      className={`${secondaryBtn} flex-shrink-0 py-1.5`}
                    >
                      {isOpen ? 'Close' : 'Configure'}
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
                            {testResultText(testResult)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}
