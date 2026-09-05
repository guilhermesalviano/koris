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

const FAMILY_ORDER: PluginItem['family'][] = ['tools', 'channels', 'skills'];

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

/**
 * A skill row carries its own documentation, so it gets a card rather than the
 * one-line toggle a tool or channel needs.
 */
function SkillRow({ item, onToggle }: { item: PluginItem; onToggle: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
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
                className="ml-auto rounded-lg border border-subtle bg-bg-3 px-3 py-1 font-mono text-[11px] text-txt-2 hover:border-accent hover:text-accent-2 disabled:opacity-50"
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
          ) : (
            <Card className="grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
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
