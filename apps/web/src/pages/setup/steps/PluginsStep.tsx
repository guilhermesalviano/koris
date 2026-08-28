import PluginsList from '../../../components/PluginsList';
import { usePlugins } from '../../../lib/use-plugins';

export function PluginsStep() {
  const api = usePlugins();

  return (
    <div>
      <p className="mb-4 font-mono text-[11px] text-txt-3">
        Turn off any tools or channels you don&apos;t want enabled. Toggling here takes effect
        immediately and can be changed later from the admin Plugins panel.
      </p>
      <PluginsList api={api} />
    </div>
  );
}
