import { Card, EmptyState, Toast, useToast } from './AdminUI';
import type { UseMarketplaceApi } from '../lib/use-marketplace';
import type { MarketplaceItem } from '../lib/types';

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const FAMILY_ORDER: MarketplaceItem['family'][] = ['tool', 'skill'];

function groupByFamily(items: MarketplaceItem[]): [MarketplaceItem['family'], MarketplaceItem[]][] {
  const groups = new Map<MarketplaceItem['family'], MarketplaceItem[]>();
  for (const item of items) {
    const group = groups.get(item.family);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.family, [item]);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));
}

function familyLabel(family: MarketplaceItem['family']): string {
  return family === 'tool' ? 'Tools' : 'Skills';
}

function MarketplaceRow({ item, pulling, onPull }: { item: MarketplaceItem; pulling: boolean; onPull: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm">{humanize(item.slug)}</div>
        {item.summary && <div className="mt-0.5 text-xs text-txt-3">{item.summary}</div>}
      </div>
      <button
        type="button"
        onClick={onPull}
        disabled={pulling}
        className="flex-shrink-0 rounded-lg border border-subtle bg-bg-3 px-3 py-1.5 font-mono text-[11px] text-txt-2 hover:border-accent hover:text-accent-2 disabled:opacity-50"
      >
        {pulling ? 'Pulling…' : 'Pull'}
      </button>
    </div>
  );
}

export default function MarketplaceList({ api }: { api: UseMarketplaceApi }) {
  const [toastMsg, showToast, isError] = useToast();

  async function handlePull(item: MarketplaceItem) {
    try {
      await api.pull(item);
      showToast(`Pulled "${humanize(item.slug)}" — run pnpm build and restart the app to activate it.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to pull from koris-hub', true);
    }
  }

  const groups = groupByFamily(api.items);

  return (
    <div className="space-y-4">
      {api.error && <EmptyState text={api.error} />}
      {!api.error && api.loading && <EmptyState text="Loading…" />}
      {!api.error && !api.loading && api.items.length === 0 && (
        <EmptyState text="Nothing new — every tool/skill in koris-hub is already present locally." />
      )}

      {!api.error && !api.loading && api.items.length > 0 && groups.map(([family, items]) => (
        <div key={family}>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-txt-3">{familyLabel(family)}</div>
          <Card className="divide-y divide-subtle p-4">
            {items.map((item) => (
              <MarketplaceRow
                key={item.slug}
                item={item}
                pulling={api.pullingSlug === item.slug}
                onPull={() => handlePull(item)}
              />
            ))}
          </Card>
        </div>
      ))}
      <Toast message={toastMsg} isError={isError} />
    </div>
  );
}
