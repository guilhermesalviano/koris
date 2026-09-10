import { useState } from 'react';
import { Card, EmptyState, Toggle, Toast, useToast, formatDate } from './AdminUI';
import { apiRequest } from '../lib/api';
import type { UsePluginsApi } from '../lib/use-plugins';
import type { PluginItem } from '../lib/types';

function humanize(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const FAMILY_ORDER: PluginItem['family'][] = ['tools', 'channels', 'mcps', 'skills'];

function groupByFamily(items: PluginItem[]): [PluginItem['family'], PluginItem[]][] {
  const groups = new Map<PluginItem['family'], PluginItem[]>();
  for (const item of items) {
    const group = groups.get(item.family);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.family, [item]);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => {
    const rank = (family: PluginItem['family']) => {
      const index = FAMILY_ORDER.indexOf(family);
      return index === -1 ? FAMILY_ORDER.length : index;
    };
    return rank(a) - rank(b);
  });
}

function PluginRow({ item, onToggle }: { item: PluginItem; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm">{humanize(item.name)}</span>
      <Toggle checked={item.enabled} onChange={onToggle} label={`Toggle ${humanize(item.name)}`} />
    </div>
  );
}

function McpRow({ item, onToggle, onSaved }: { item: PluginItem; onToggle: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openConfig() {
    if (editing) {
      setEditing(false);
      return;
    }
    try {
      const config = await apiRequest<{ url: string; bearer_token: string }>(`/mcps/${encodeURIComponent(item.name)}/config`);
      setUrl(config.url);
      setToken(config.bearer_token);
      setEditing(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP configuration');
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await apiRequest(`/mcps/${encodeURIComponent(item.name)}/config`, {
        method: 'PATCH',
        body: JSON.stringify({ url, bearer_token: token }),
      });
      setEditing(false);
      setError(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save MCP configuration');
    } finally {
      setSaving(false);
    }
  }

  const status = item.mcpStatus;
  return (
    <div className="border-b border-subtle/40 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm">{humanize(item.name)}</span>
          {status && (
            <div className="font-mono text-[10px] text-txt-3">
              {status.state}{status.state === 'connected' ? ` · ${status.toolCount} tools` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openConfig} className="font-mono text-[11px] text-accent-2 hover:underline">
            {editing ? 'Cancel' : 'Configure'}
          </button>
          <Toggle checked={item.enabled} onChange={onToggle} label={`Toggle ${humanize(item.name)}`} />
        </div>
      </div>
      {status?.error && <div className="mt-1 break-words text-xs text-red-400">{status.error}</div>}
      {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
      {editing && (
        <div className="mt-3 grid gap-2">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://server.example/mcp" className="rounded-lg border border-subtle bg-bg-2 px-3 py-2 font-mono text-xs" />
          <input value={token} onChange={(event) => setToken(event.target.value)} type="password" placeholder="Optional bearer token" className="rounded-lg border border-subtle bg-bg-2 px-3 py-2 font-mono text-xs" />
          <button type="button" disabled={saving} onClick={saveConfig} className="justify-self-start rounded-lg border border-accent px-3 py-1.5 font-mono text-[11px] text-accent-2 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A skill row carries its own documentation, so it gets a card rather than the
 * one-line toggle a tool or channel needs.
 */
function SkillRow({ item, onToggle }: { item: PluginItem; onToggle: () => void }) {
  return (
    <Card className="p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="font-mono text-xs text-accent-2">{item.name}</span>
            {item.learned_at && (
              <span className="font-mono text-[10px] text-txt-3">synced {formatDate(item.learned_at)}</span>
            )}
          </div>
          {item.description && <div className="mt-1 text-sm text-txt-2">{item.description}</div>}
        </div>
        <Toggle checked={item.enabled} onChange={onToggle} label={`Toggle ${humanize(item.name)}`} />
      </div>
    </Card>
  );
}

export default function PluginsList({ api }: { api: UsePluginsApi }) {
  const [toastMsg, showToast, isError] = useToast();
  const [resyncing, setResyncing] = useState(false);

  async function handleToggle(item: PluginItem) {
    try {
      await api.toggle(item);
      await api.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update plugin', true);
    }
  }

  async function resyncSkills() {
    setResyncing(true);
    try {
      await apiRequest('/skills/sync', { method: 'POST' });
      showToast('Skills resynced');
      api.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Resync failed', true);
    } finally {
      setResyncing(false);
    }
  }

  const groups = groupByFamily(api.items);

  return (
    <div className="space-y-4">
      {api.error && <EmptyState text={api.error} />}
      {!api.error && api.loading && <EmptyState text="Loading…" />}
      {!api.error && !api.loading && api.items.length === 0 && <EmptyState text="No plugins found." />}

      {!api.error && !api.loading && api.items.length > 0 && groups.map(([family, items]) => (
        <div key={family}>
          <div className="mb-2 flex items-center gap-3">
            <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">{humanize(family)}</div>
            {family === 'skills' && (
              <button
                type="button"
                onClick={resyncSkills}
                disabled={resyncing}
                className="ml-auto flex-shrink-0 rounded-lg border border-subtle bg-bg-3 px-3 py-1 font-mono text-[11px] text-txt-2 hover:border-accent hover:text-accent-2 disabled:opacity-50"
              >
                {resyncing ? 'Resyncing…' : 'Resync from disk'}
              </button>
            )}
          </div>

          {family === 'skills' ? (
            <div className="space-y-2">
              {items.map((item) => (
                <SkillRow key={item.name} item={item} onToggle={() => handleToggle(item)} />
              ))}
            </div>
          ) : family === 'mcps' ? (
            <Card className="p-3.5 sm:p-4">
              {items.map((item) => (
                <McpRow key={item.name} item={item} onToggle={() => handleToggle(item)} onSaved={() => void api.reload()} />
              ))}
            </Card>
          ) : (
            <Card className="grid grid-cols-1 divide-y divide-subtle/40 p-3.5 sm:grid-cols-2 sm:divide-y-0 sm:gap-x-6 sm:p-4">
              {items.map((item) => (
                <PluginRow key={item.name} item={item} onToggle={() => handleToggle(item)} />
              ))}
            </Card>
          )}
        </div>
      ))}
      <Toast message={toastMsg} isError={isError} />
    </div>
  );
}
