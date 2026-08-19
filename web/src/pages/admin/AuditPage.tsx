import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { AuditItem, AuditResponse } from '../../lib/types';

const PAGE_SIZE = 50;

function typeLabel(type: string): string {
  return type === 'llm' ? 'LLM' : 'tool';
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (offset) params.set('offset', String(offset));
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      const res = await apiRequest<AuditResponse>(`/audit?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    }
  }, [type, status, offset]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await apiRequest<AuditItem>(`/audit/${id}`);
      setDetail(res);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load entry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function applyFilters(nextType: string, nextStatus: string) {
    setType(nextType);
    setStatus(nextStatus);
    setOffset(0);
    setSelectedId(null);
    setDetail(null);
  }

  async function deleteEntry(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this audit entry?')) return;
    try {
      await apiRequest(`/audit/${id}`, { method: 'DELETE' });
      showToast('Entry deleted');
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', true);
    }
  }

  async function clearAll() {
    if (!confirm('Delete ALL audit entries?')) return;
    try {
      await apiRequest('/audit', { method: 'DELETE' });
      showToast('Audit log cleared');
      setSelectedId(null);
      setDetail(null);
      setOffset(0);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Clear failed', true);
    }
  }

  const selectClass =
    'rounded-lg border border-strong bg-bg-3 px-3 py-1.5 font-mono text-[11px] text-txt-2 outline-none focus:border-accent';

  return (
    <PageShell title="Audit log" description="Tool-call audit trail" onRefresh={() => { load(); if (selectedId) loadDetail(selectedId); }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => applyFilters(e.target.value, status)} className={selectClass}>
          <option value="">all types</option>
          <option value="llm">LLM</option>
          <option value="tool">tool</option>
        </select>
        <select value={status} onChange={(e) => applyFilters(type, e.target.value)} className={selectClass}>
          <option value="">all statuses</option>
          <option value="success">success</option>
          <option value="error">error</option>
        </select>
        <div className="ml-auto font-mono text-[11px] text-txt-3">{data ? `${data.total} entries` : ''}</div>
      </div>

      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && data.items.length === 0 && <EmptyState text="No audit entries." />}
      {!error && data && data.items.length > 0 && (
        <>
          <Card className="!p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-subtle text-left font-mono text-[11px] uppercase tracking-wide text-txt-3">
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Role · Agent</th>
                    <th className="px-3 py-2">Provider / Model</th>
                    <th className="px-3 py-2">Prompt</th>
                    <th className="px-3 py-2">Response</th>
                    <th className="px-3 py-2">Dur</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-b border-subtle/60 hover:bg-bg-3/60 ${selectedId === item.id ? 'bg-bg-3' : ''}`}
                      onClick={() => loadDetail(item.id)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-txt-2">{formatDate(item.createdAt)}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{typeLabel(item.type)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono text-txt-2">{item.role}</span>
                        {item.agentName && <span className="text-txt-3"> · {item.agentName}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-txt-2">
                        {item.type === 'llm' ? `${item.provider ?? '?'}${item.model ? ` / ${item.model}` : ''}` : item.toolName}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs text-txt-2">
                        {item.promptPreview ?? item.toolArgs ?? ''}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs text-txt-2">{item.responsePreview ?? ''}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-txt-3">{item.durationMs}ms</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                            item.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={(e) => deleteEntry(item.id, e)}
                          className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={clearAll}
              className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400"
            >
              Clear all
            </button>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 disabled:opacity-40 hover:border-accent hover:text-accent-2"
              >
                ‹ Prev
              </button>
              <span className="font-mono text-[11px] text-txt-3">{offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)}</span>
              <button
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-md border border-subtle px-2 py-1 font-mono text-[11px] text-txt-3 disabled:opacity-40 hover:border-accent hover:text-accent-2"
              >
                Next ›
              </button>
            </div>
          </div>
        </>
      )}

      {selectedId && (
        <div className="mt-4">
          {detailError && <EmptyState text={detailError} />}
          {!detailError && !detail && <EmptyState text="Loading entry…" />}
          {!detailError && detail && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">Entry {detail.id.slice(0, 12)}…</div>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                    detail.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {detail.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px] text-txt-2 md:grid-cols-4">
                <div><span className="text-txt-3">time </span>{formatDate(detail.createdAt)}</div>
                <div><span className="text-txt-3">type </span>{typeLabel(detail.type)}</div>
                <div><span className="text-txt-3">role </span>{detail.role} {detail.agentName && `· ${detail.agentName}`}</div>
                <div><span className="text-txt-3">channel </span>{detail.channel ?? '—'}</div>
                <div><span className="text-txt-3">runId </span>{detail.runId ?? '—'}</div>
                <div><span className="text-txt-3">sessionId </span>{detail.sessionId ?? '—'}</div>
                <div><span className="text-txt-3">duration </span>{detail.durationMs}ms</div>
                <div><span className="text-txt-3">model </span>{detail.model ?? detail.provider ?? '—'}</div>
                {detail.finishReason && <div><span className="text-txt-3">finish </span>{detail.finishReason}</div>}
                {detail.toolCalls !== undefined && <div><span className="text-txt-3">toolCalls </span>{detail.toolCalls}</div>}
                {detail.errorCode && <div className="text-red-400"><span className="text-txt-3">error </span>{detail.errorCode}</div>}
                {detail.errorMessage && <div className="col-span-3 break-all text-red-400">{detail.errorMessage}</div>}
              </div>

              {detail.type === 'llm' ? (
                <>
                  <div className="mt-4">
                    <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-txt-3">Prompt ({detail.promptLength ?? 0} chars)</div>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">
                      {prettyJson(detail.prompt)}
                    </pre>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-txt-3">Response ({detail.responseLength ?? 0} chars)</div>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">
                      {prettyJson(detail.response)}
                    </pre>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4">
                    <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-txt-3">Tool args</div>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">
                      {prettyJson(detail.toolArgs)}
                    </pre>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-txt-3">Result {detail.success ? '(ok)' : '(failed)'}</div>
                    <pre className="max-h-72 overflow-auto rounded-lg bg-bg-3 p-3 font-mono text-[11px] text-txt-2">{detail.response}</pre>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      )}

      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}

function prettyJson(value?: string | null): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
