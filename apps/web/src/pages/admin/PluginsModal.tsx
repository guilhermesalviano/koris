import { useState } from 'react';
import Modal from '../../components/Modal';
import PluginsList from '../../components/PluginsList';
import MarketplaceList from '../../components/MarketplaceList';
import { usePlugins } from '../../lib/use-plugins';
import { useMarketplace } from '../../lib/use-marketplace';

const secondaryBtn = 'rounded-lg border border-strong bg-bg-3 px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-60';

type TabKey = 'installed' | 'marketplace';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'installed', label: 'Installed' },
  { key: 'marketplace', label: 'Marketplace' },
];

export default function PluginsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('installed');
  const pluginsApi = usePlugins();
  const marketplaceApi = useMarketplace();

  return (
    <Modal open={open} onClose={onClose} title="Plugins" maxWidthClassName="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
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

      {tab === 'installed' ? <PluginsList api={pluginsApi} /> : <MarketplaceList api={marketplaceApi} />}
    </Modal>
  );
}
