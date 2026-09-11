import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Modal from '../../components/Modal';
import { ChannelsIcon, CloseIcon, PluginsIcon, ProvidersIcon, SessionsIcon, SettingsIcon, SkillsIcon } from '../../components/Icons';
import { useSaveCoordinator, useSaveStates } from '../../lib/config-save-context';
import SessionsPage from './SessionsPage';
import ChannelsPage from './ChannelsPage';
import ProvidersPage from './ProvidersPage';
import PluginsPage from './PluginsPage';
import GeneralPage from './GeneralPage';
import SkillsSettingsPage from './SkillsSettingsPage';

export interface Section {
  id: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}

export const SECTIONS: Section[] = [
  { id: 'providers', label: 'Providers', description: 'Models & intelligence', Icon: ProvidersIcon, Component: ProvidersPage },
  { id: 'channels', label: 'Channels', description: 'Messaging & connections', Icon: ChannelsIcon, Component: ChannelsPage },
  { id: 'plugins', label: 'Plugins', description: 'Extensions & marketplace', Icon: PluginsIcon, Component: PluginsPage },
  { id: 'skills', label: 'Skills', description: 'Knowledge & instructions', Icon: SkillsIcon, Component: SkillsSettingsPage },
  { id: 'sessions', label: 'Sessions', description: 'Conversation history', Icon: SessionsIcon, Component: SessionsPage },
  { id: 'general', label: 'General', description: 'Personal context & access', Icon: SettingsIcon, Component: GeneralPage },
];

export default function ConfigModal({
  open,
  onClose,
  initialSectionId = 'providers',
}: {
  open: boolean;
  onClose: () => void;
  initialSectionId?: string;
}) {
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [showContentOnMobile, setShowContentOnMobile] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);
  const saves = useSaveCoordinator();
  const states = useSaveStates();
  const errors = states.filter((state) => state.state === 'error' || state.state === 'invalid');
  const saving = states.some((state) => state.state === 'pending' || state.state === 'saving');
  const saved = states.some((state) => state.state === 'saved');
  const status = errors.length
    ? `${errors.length} ${errors.length === 1 ? 'change needs' : 'changes need'} attention`
    : saving
      ? 'Saving changes…'
      : saved
        ? 'All changes saved'
        : 'Changes save automatically';

  useEffect(() => {
    if (open && initialSectionId && SECTIONS.some((s) => s.id === initialSectionId)) {
      setSectionId(initialSectionId);
    }
  }, [open, initialSectionId]);

  useEffect(() => {
    if (!open) {
      void saves.flush();
      setShowContentOnMobile(false);
    }
  }, [open, saves]);

  const active = SECTIONS.find((section) => section.id === sectionId) ?? SECTIONS[0];
  const ActivePage = active.Component;

  function selectSection(id: string) {
    void saves.flush();
    setSectionId(id);
    setShowContentOnMobile(true);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const currentIndex = SECTIONS.findIndex((s) => s.id === sectionId);
    let nextIndex = -1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % SECTIONS.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + SECTIONS.length) % SECTIONS.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = SECTIONS.length - 1;
    }
    if (nextIndex >= 0) {
      const nextSection = SECTIONS[nextIndex];
      selectSection(nextSection.id);
      const nextButton = tabListRef.current?.querySelector<HTMLButtonElement>(`#tab-${nextSection.id}`);
      nextButton?.focus();
    }
  }

  function close() {
    void saves.flush();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Configuration"
      description="Your assistant, set up your way."
      maxWidthClassName="max-w-5xl"
      bodyClassName="p-0 flex flex-col configuration"
      fullHeightOnMobile
      customHeader={
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-subtle bg-bg-2 px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <SettingsIcon className="h-4 w-4 fill-none stroke-current" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-txt">Configuration</span>
              <span className="hidden text-xs text-txt-3 sm:inline">/</span>
              <span className="hidden text-xs font-medium text-txt-2 sm:inline">{active.label}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close dialog"
            title="Close (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-subtle text-txt-2 transition-colors hover:border-accent hover:text-accent-2"
          >
            <CloseIcon className="h-4 w-4 fill-none stroke-current" />
          </button>
        </header>
      }
      footer={
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-subtle bg-bg-2 px-5 py-3 text-[11px] sm:px-6">
          <div aria-live="polite" className={`flex items-center gap-2 ${errors.length ? 'text-red-400' : 'text-txt-2'}`}>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                errors.length ? 'bg-red-400' : saving ? 'animate-pulse bg-accent' : 'bg-emerald-500'
              }`}
            />
            {status}
          </div>
          {errors.length ? (
            <button
              type="button"
              onClick={() => selectSection(errors[0].key.split('.')[0])}
              className="text-accent-2 hover:underline"
            >
              Review
            </button>
          ) : (
            <span className="hidden text-txt-3 sm:block">Esc to close</span>
          )}
        </footer>
      }
    >
      <div className="flex min-h-0 flex-1 sm:h-[min(72dvh,720px)] sm:flex-auto">
        <nav
          ref={tabListRef}
          role="tablist"
          aria-orientation="vertical"
          aria-label="Configuration sections"
          onKeyDown={handleTabKeyDown}
          className={`w-full flex-shrink-0 overflow-y-auto bg-bg-3/30 p-3 sm:block sm:w-56 sm:border-r sm:border-subtle ${
            showContentOnMobile ? 'hidden' : 'block'
          }`}
        >
          <div className="px-3 pb-3 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-txt-3">
            Workspace settings
          </div>
          <div className="space-y-1">
            {SECTIONS.map(({ id, label, description, Icon }) => {
              const hasError = errors.some((error) => error.key.startsWith(`${id}.`));
              const isSelected = id === sectionId;
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`panel-${id}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => selectSection(id)}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-accent-muted bg-accent-muted text-accent-2'
                      : 'border-transparent text-txt-2 hover:bg-bg-3 hover:text-txt'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0 fill-none stroke-current" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className={`mt-0.5 block text-[11px] ${isSelected ? 'text-accent-2' : 'text-txt-2'}`}>
                      {description}
                    </span>
                  </span>
                  {hasError && <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-label="Unsaved changes" />}
                  <span aria-hidden="true" className="text-lg sm:hidden">
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        <section
          id={`panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${active.id}`}
          className={`min-w-0 flex-1 flex-col overflow-hidden bg-bg/25 ${showContentOnMobile ? 'flex' : 'hidden sm:flex'}`}
        >
          <button
            type="button"
            onClick={() => {
              void saves.flush();
              setShowContentOnMobile(false);
            }}
            className="flex flex-shrink-0 items-center gap-2 border-b border-subtle px-5 py-3 text-xs text-txt-2 hover:text-txt sm:hidden"
          >
            <span aria-hidden="true">‹</span> All settings
          </button>
          <ActivePage />
        </section>
      </div>
    </Modal>
  );
}
