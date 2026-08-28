import { Card, EmptyState, Toggle, Toast, useToast } from './AdminUI';
import type { UsePluginsApi } from '../lib/use-plugins';
import type { PluginItem } from '../lib/types';

function humanize(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

  const tools = api.items.filter((i) => i.family === 'tools');
  const channels = api.items.filter((i) => i.family === 'channels');

  return (
    <div className="space-y-4">
      {api.error && <EmptyState text={api.error} />}
      {!api.error && api.loading && <EmptyState text="Loading…" />}
      {!api.error && !api.loading && api.items.length === 0 && <EmptyState text="No plugins found." />}

      {!api.error && !api.loading && api.items.length > 0 && (
        <>
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-txt-3">Tools</div>
            <Card className="grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
              {tools.map((item) => (
                <PluginRow key={item.name} item={item} onToggle={() => handleToggle(item)} />
              ))}
            </Card>
          </div>
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-txt-3">Channels</div>
            <Card className="grid grid-cols-1 gap-x-6 p-4 sm:grid-cols-2">
              {channels.map((item) => (
                <PluginRow key={item.name} item={item} onToggle={() => handleToggle(item)} />
              ))}
            </Card>
          </div>
        </>
      )}
      <Toast message={toastMsg} isError={isError} />
    </div>
  );
}
