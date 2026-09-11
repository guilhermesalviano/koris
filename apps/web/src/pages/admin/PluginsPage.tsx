import { useMemo, useState } from 'react';
import { SettingsSection } from '../../components/SettingsUI';
import { useSaveCoordinator } from '../../lib/config-save-context';
import PluginsList from '../../components/PluginsList';
import MarketplaceList from '../../components/MarketplaceList';
import { usePlugins } from '../../lib/use-plugins';
import { useMarketplace } from '../../lib/use-marketplace';
import type { MarketplaceItem } from '../../lib/types';

const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-60';

type TabKey = 'installed' | 'marketplace';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'installed', label: 'Installed' },
  { key: 'marketplace', label: 'Marketplace' },
];

export default function PluginsPage() {
  const saves = useSaveCoordinator();
  const [tab, setTab] = useState<TabKey>('installed');
  const pluginsApi = usePlugins();
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
    <SettingsSection title="Plugins" description="Extend your assistant with tools, channels, skills, and MCP servers.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { void saves.flush(); setTab(t.key); }}
            aria-pressed={tab === t.key}
            className={
              tab === t.key
                ? 'rounded-lg border border-accent-muted bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent-2'
                : secondaryBtn
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'installed' ? <PluginsList api={pluginsApi} /> : <MarketplaceList api={wrappedMarketplaceApi} />}
    </SettingsSection>
  );
}
