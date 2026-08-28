import { Card, EmptyState, Toggle, Toast, useToast } from './AdminUI';
import type { UsePluginsApi } from '../lib/use-plugins';
import type { PluginItem } from '../lib/types';

function humanize(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const FAMILY_ORDER: PluginItem['family'][] = ['tools', 'channels'];

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

export default function PluginsList({ api }: { api: UsePluginsApi }) {
  const [toastMsg, showToast, isError] = useToast();

  async function handleToggle(item: PluginItem) {
    try {
      await api.toggle(item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update plugin', true);
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
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-txt-3">{humanize(family)}</div>
          <Card className="grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
            {items.map((item) => (
              <PluginRow key={item.name} item={item} onToggle={() => handleToggle(item)} />
            ))}
          </Card>
        </div>
      ))}
      <Toast message={toastMsg} isError={isError} />
    </div>
  );
}
