import { useEffect, useState, type ComponentType } from 'react';
import Modal from '../../components/Modal';
import { ChannelsIcon, ProvidersIcon, SessionsIcon, SettingsIcon } from '../../components/Icons';
import SessionsPage from './SessionsPage';
import ChannelsPage from './ChannelsPage';
import ProvidersPage from './ProvidersPage';
import GeneralPage from './GeneralPage';

type IconComponent = ComponentType<{ className?: string }>;

interface Section {
  id: string;
  label: string;
  Icon: IconComponent;
  Component: ComponentType;
}

const SECTIONS: Section[] = [
  { id: 'providers', label: 'Providers', Icon: ProvidersIcon, Component: ProvidersPage },
  { id: 'channels', label: 'Channels', Icon: ChannelsIcon, Component: ChannelsPage },
  { id: 'sessions', label: 'Sessions', Icon: SessionsIcon, Component: SessionsPage },
  { id: 'general', label: 'General', Icon: SettingsIcon, Component: GeneralPage },
];

const DEFAULT_SECTION = SECTIONS[0].id;

const itemBase =
  'flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left text-[13px] text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt';
const itemActive = 'bg-accent-muted !text-accent-2 border-accent-muted';

export default function ConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sectionId, setSectionId] = useState(DEFAULT_SECTION);
  const [showContentOnMobile, setShowContentOnMobile] = useState(false);

  useEffect(() => {
    if (!open) setShowContentOnMobile(false);
  }, [open]);

  const active = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  const ActivePage = active.Component;

  function selectSection(id: string) {
    setSectionId(id);
    setShowContentOnMobile(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="Configuration" maxWidthClassName="max-w-5xl" bodyClassName="p-0">
      <div className="flex h-[70vh] min-h-0">
        <nav
          className={`w-full flex-shrink-0 space-y-0.5 overflow-y-auto border-subtle p-2 sm:block sm:w-52 sm:border-r ${
            showContentOnMobile ? 'hidden' : 'block'
          }`}
        >
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectSection(id)}
              className={`${itemBase} ${id === sectionId ? itemActive : ''}`}
            >
              <Icon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section
          className={`min-w-0 flex-1 flex-col overflow-hidden ${showContentOnMobile ? 'flex' : 'hidden sm:flex'}`}
        >
          <button
            type="button"
            onClick={() => setShowContentOnMobile(false)}
            className="flex flex-shrink-0 items-center gap-1.5 border-b border-subtle px-4 py-2 text-[13px] text-txt-2 transition-colors duration-150 hover:text-txt sm:hidden"
          >
            <span aria-hidden>&lsaquo;</span>
            Back
          </button>
          <ActivePage />
        </section>
      </div>
    </Modal>
  );
}
