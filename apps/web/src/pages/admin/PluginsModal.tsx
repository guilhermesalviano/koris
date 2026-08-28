import Modal from '../../components/Modal';
import PluginsList from '../../components/PluginsList';
import { usePlugins } from '../../lib/use-plugins';

export default function PluginsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = usePlugins();

  return (
    <Modal open={open} onClose={onClose} title="Plugins">
      <PluginsList api={api} />
    </Modal>
  );
}
