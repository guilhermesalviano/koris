import { useEffect, useState, type ComponentType } from 'react';
import Modal from '../../components/Modal';
import { ChannelsIcon, PluginsIcon, ProvidersIcon, SessionsIcon, SettingsIcon, SkillsIcon } from '../../components/Icons';
import { useSaveCoordinator, useSaveStates } from '../../lib/config-save-context';
import SessionsPage from './SessionsPage';
import ChannelsPage from './ChannelsPage';
import ProvidersPage from './ProvidersPage';
import PluginsPage from './PluginsPage';
import GeneralPage from './GeneralPage';
import SkillsSettingsPage from './SkillsSettingsPage';

interface Section {
  id: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}

const SECTIONS: Section[] = [
  { id: 'providers', label: 'Providers', description: 'Models & intelligence', Icon: ProvidersIcon, Component: ProvidersPage },
  { id: 'channels', label: 'Channels', description: 'Messaging & connections', Icon: ChannelsIcon, Component: ChannelsPage },
  { id: 'plugins', label: 'Plugins', description: 'Extensions & marketplace', Icon: PluginsIcon, Component: PluginsPage },
  { id: 'skills', label: 'Skills', description: 'Knowledge & instructions', Icon: SkillsIcon, Component: SkillsSettingsPage },
  { id: 'sessions', label: 'Sessions', description: 'Conversation history', Icon: SessionsIcon, Component: SessionsPage },
  { id: 'general', label: 'General', description: 'Personal context & access', Icon: SettingsIcon, Component: GeneralPage },
];

export default function ConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sectionId, setSectionId] = useState('providers');
  const [showContentOnMobile, setShowContentOnMobile] = useState(false);
  const saves = useSaveCoordinator();
  const states = useSaveStates();
  const errors = states.filter((state) => state.state === 'error' || state.state === 'invalid');
  const saving = states.some((state) => state.state === 'pending' || state.state === 'saving');
  const saved = states.some((state) => state.state === 'saved');
  const status = errors.length ? `${errors.length} ${errors.length === 1 ? 'change needs' : 'changes need'} attention` : saving ? 'Saving changes…' : saved ? 'All changes saved' : 'Changes save automatically';

  useEffect(() => {
    if (!open) { void saves.flush(); setShowContentOnMobile(false); }
  }, [open, saves]);

  const active = SECTIONS.find((section) => section.id === sectionId) ?? SECTIONS[0];
  const ActivePage = active.Component;

  function selectSection(id: string) {
    void saves.flush();
    setSectionId(id);
    setShowContentOnMobile(true);
  }

  function close() {
    void saves.flush();
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Configuration" description="Your assistant, set up your way." maxWidthClassName="max-w-5xl" bodyClassName="p-0 flex flex-col configuration" fullHeightOnMobile>
      <div className="flex min-h-0 flex-1 sm:h-[min(72dvh,720px)] sm:flex-auto">
        <nav aria-label="Configuration sections" className={`w-full flex-shrink-0 overflow-y-auto bg-bg-3/30 p-3 sm:block sm:w-56 sm:border-r sm:border-subtle ${showContentOnMobile ? 'hidden' : 'block'}`}>
          <div className="px-3 pb-3 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-txt-3">Workspace settings</div>
          <div className="space-y-1">
            {SECTIONS.map(({ id, label, description, Icon }) => {
              const hasError = errors.some((error) => error.key.startsWith(`${id}.`));
              return (
                <button key={id} type="button" onClick={() => selectSection(id)} aria-current={id === sectionId ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${id === sectionId ? 'border-accent-muted bg-accent-muted text-accent-2' : 'border-transparent text-txt-2 hover:bg-bg-3 hover:text-txt'}`}>
                  <Icon className="h-[18px] w-[18px] flex-shrink-0 fill-none stroke-current" />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{label}</span><span className={`mt-0.5 block text-[11px] ${id === sectionId ? 'text-accent-2' : 'text-txt-2'}`}>{description}</span></span>
                  {hasError && <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-label="Unsaved changes" />}
                  <span aria-hidden="true" className="text-lg sm:hidden">›</span>
                </button>
              );
            })}
          </div>
        </nav>
        <section aria-label={active.label} className={`min-w-0 flex-1 flex-col overflow-hidden bg-bg/25 ${showContentOnMobile ? 'flex' : 'hidden sm:flex'}`}>
          <button type="button" onClick={() => { void saves.flush(); setShowContentOnMobile(false); }} className="flex flex-shrink-0 items-center gap-2 border-b border-subtle px-5 py-3 text-xs text-txt-2 hover:text-txt sm:hidden"><span aria-hidden="true">‹</span> All settings</button>
          <ActivePage />
        </section>
      </div>
      <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-subtle bg-bg-2 px-5 py-3 text-[11px] sm:px-6">
        <div aria-live="polite" className={`flex items-center gap-2 ${errors.length ? 'text-red-400' : 'text-txt-2'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${errors.length ? 'bg-red-400' : saving ? 'animate-pulse bg-accent' : 'bg-emerald-500'}`} />{status}</div>
        {errors.length ? <button type="button" onClick={() => selectSection(errors[0].key.split('.')[0])} className="text-accent-2 hover:underline">Review</button> : <span className="hidden text-txt-3 sm:block">Esc to close</span>}
      </footer>
    </Modal>
  );
}
