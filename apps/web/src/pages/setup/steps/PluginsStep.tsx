import { useMemo, useState } from 'react';
import PluginsList from '../../../components/PluginsList';
import MarketplaceList from '../../../components/MarketplaceList';
import { usePlugins, type UsePluginsApi } from '../../../lib/use-plugins';
import { useMarketplace } from '../../../lib/use-marketplace';
import type { MarketplaceItem } from '../../../lib/types';
import type { SettingsFormApi } from '../../../lib/use-settings-form';

const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-60';

type TabKey = 'marketplace' | 'installed';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'installed', label: 'Installed' },
];

export function PluginsStep({
  pluginsApi: providedPluginsApi,
}: {
  api?: SettingsFormApi;
  pluginsApi?: UsePluginsApi;
} = {}) {
  const [tab, setTab] = useState<TabKey>('marketplace');
  const localPluginsApi = usePlugins();
  const pluginsApi = providedPluginsApi ?? localPluginsApi;
  const marketplaceApi = useMarketplace();

  const wrappedMarketplaceApi = useMemo(
    () => ({
      ...marketplaceApi,
      pull: async (item: MarketplaceItem) => {
        await marketplaceApi.pull(item);
        await pluginsApi.reload();
      },
    }),
    [marketplaceApi, pluginsApi],
  );

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'flex items-center justify-center rounded-lg border border-accent-muted bg-accent-muted px-3 py-2 text-sm font-medium text-accent-2 sm:py-1.5'
                : `${secondaryBtn} flex items-center justify-center py-2 sm:py-1.5`
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-4 font-mono text-[11px] text-txt-3">
        {tab === 'marketplace'
          ? 'Browse and download tools and skills from Koris Hub. Downloaded plugins are activated automatically.'
          : 'Turn off any tools, channels, or skills you don’t want enabled. Toggling here takes effect immediately and can be changed later from the admin Plugins panel.'}
      </p>

      {tab === 'marketplace' ? (
        <MarketplaceList api={wrappedMarketplaceApi} />
      ) : (
        <PluginsList api={pluginsApi} />
      )}
    </div>
  );
}
