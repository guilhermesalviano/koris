import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CloseIcon, MenuIcon, OverviewIcon, SettingsIcon } from '../../components/Icons';
import { IconButton } from '../../components/ui';
import { AgentTree } from '../../components/sidebar/AgentTree';
import { agentPath, buildAgentTree, ORCHESTRATOR_ID } from '../../lib/agents';
import { useAgents } from '../../lib/use-agents';
import { cn } from '../../lib/cn';
import ConfigModal from './ConfigModal';
import { useSaveStates } from '../../lib/config-save-context';
import OrchestratorPage from './agents/OrchestratorPage';
import NegotiatorPanel from './agents/NegotiatorPanel';
import WatcherPanel from './agents/WatcherPanel';
import ActivityPage, { DEFAULT_ACTIVITY_TAB } from './ActivityPage';
import { ChatProvider } from '../../lib/chat-context';
import { UiProvider, useUi } from '../../lib/ui-context';
import { ProvidersProvider } from '../../lib/use-providers';

/** Shared chrome for the sidebar/drawer nav rows — active state without an `!important`. */
function navItemClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex w-full items-center gap-2.5 rounded-control border border-transparent px-3 py-2.5',
    'text-body transition-colors duration-150 outline-none',
    'focus-visible:ring-2 focus-visible:ring-accent/40',
    isActive
      ? 'border-accent-muted bg-accent-muted text-accent-2'
      : 'text-txt-2 hover:bg-bg-3 hover:text-txt',
  );
}

const NAV_ICON_CLASS = 'h-4 w-4 flex-shrink-0 fill-none stroke-current';

const ORCHESTRATOR_PATH = agentPath(ORCHESTRATOR_ID);

function PrimaryNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Views" className="flex-shrink-0 border-b border-subtle p-2">
      <NavLink to="/admin/activity" onClick={onNavigate} className={navItemClass}>
        <OverviewIcon className={NAV_ICON_CLASS} />
        <span>Activity</span>
      </NavLink>
    </nav>
  );
}

function Drawer({
  open,
  onClose,
  label,
  mobileOnly = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  mobileOnly?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={mobileOnly ? 'md:hidden' : undefined} aria-hidden={!open}>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-subtle bg-bg-2',
          'shadow-pop transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}

const THEME_KEY = 'koris-theme';

function getInitialDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) !== 'light';
  } catch {
    return true;
  }
}

/**
 * Mobile top bar. On `md:` and up the sidebar plus each page's own PageShell
 * header carry the navigation, so this bar stays out of the way.
 */
function Header({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="relative z-20 flex h-14 flex-shrink-0 items-center gap-2 border-b border-subtle bg-bg/80 px-3 backdrop-blur-md md:hidden">
      <IconButton aria-label="Open navigation" onClick={onOpenNav}>
        <MenuIcon className={NAV_ICON_CLASS} />
      </IconButton>
      <span className="font-mono text-caption tracking-wide text-txt-2">koris</span>
    </header>
  );
}

function AgentsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { agents, loading, error } = useAgents();
  const tree = useMemo(() => buildAgentTree(agents), [agents]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2 font-mono text-micro uppercase text-txt-3">Agents</div>
      <nav aria-label="Agents" className="flex-1 overflow-y-auto px-2 pb-3">
        {error ? (
          <div className="px-3 py-8 text-center font-mono text-mini text-danger">{error}</div>
        ) : loading ? (
          <div className="px-3 py-8 text-center font-mono text-mini text-txt-3">Loading agents…</div>
        ) : (
          <AgentTree nodes={tree} onNavigate={onNavigate} />
        )}
      </nav>
    </div>
  );
}

function ConfigButton({ onOpen }: { onOpen: () => void }) {
  const hasError = useSaveStates().some((state) => state.state === 'error' || state.state === 'invalid');
  return (
    <button
      onClick={onOpen}
      aria-label="Configuration"
      title={hasError ? 'Configuration · changes need attention' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-control border border-transparent px-3 py-2.5',
        'text-body text-txt-2 transition-colors duration-150 outline-none',
        'hover:bg-bg-3 hover:text-txt focus-visible:ring-2 focus-visible:ring-accent/40',
      )}
    >
      <SettingsIcon className={NAV_ICON_CLASS} />
      <span>Configuration</span>
      {hasError && <span aria-label="Changes need attention" className="h-1.5 w-1.5 rounded-full bg-danger" />}
    </button>
  );
}

/** Body shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({ onNavigate, onOpenConfig }: { onNavigate?: () => void; onOpenConfig: () => void }) {
  return (
    <>
      <PrimaryNav onNavigate={onNavigate} />
      <div className="min-h-0 flex-1">
        <AgentsPanel onNavigate={onNavigate} />
      </div>
      <div className="flex-shrink-0 border-t border-subtle p-2">
        <ConfigButton onOpen={onOpenConfig} />
      </div>
    </>
  );
}

function Sidebar() {
  const { openConfig } = useUi();
  return (
    <aside className="relative hidden w-60 flex-shrink-0 flex-col border-r border-subtle bg-bg-2 md:flex">
      <SidebarContent onOpenConfig={() => openConfig()} />
    </aside>
  );
}

/** Keeps old page URLs working for views that now live in the Configuration modal. */
function ConfigSectionRedirect({ sectionId }: { sectionId: string }) {
  const { openConfig } = useUi();
  useEffect(() => {
    openConfig(sectionId);
  }, [openConfig, sectionId]);
  return <Navigate to={ORCHESTRATOR_PATH} replace />;
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-subtle px-3">
      <span className="text-body font-medium text-txt">{title}</span>
      <IconButton aria-label={`Close ${title}`} size="sm" onClick={onClose} className="ml-auto">
        <CloseIcon className={NAV_ICON_CLASS} />
      </IconButton>
    </div>
  );
}

export default function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSection, setConfigSection] = useState<string | undefined>('general');
  const [isDark, setIsDark] = useState(getInitialDark);

  function handleOpenConfig(sectionId?: string) {
    setConfigSection(sectionId || 'general');
    setConfigOpen(true);
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // storage unavailable — theme still applies for this session
    }
  }, [isDark]);

  return (
    <ProvidersProvider>
      <ChatProvider>
        <UiProvider value={{ openConfig: handleOpenConfig, isDark, toggleTheme: () => setIsDark((d) => !d) }}>
          <div className="relative z-10 flex h-screen w-full flex-col supports-[height:100dvh]:h-dvh">
            <div className="flex min-h-0 min-w-0 flex-1">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Header onOpenNav={() => setNavOpen(true)} />
                <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <Routes>
                    <Route index element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                    <Route path="agents" element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                    <Route path="agents/orchestrator" element={<OrchestratorPage />} />
                    <Route path="agents/negotiator" element={<NegotiatorPanel />} />
                    <Route path="agents/watcher" element={<WatcherPanel />} />
                    <Route path="agents/*" element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                    {/* The session list is gone; old chat links open the Orchestrator thread. */}
                    <Route path="chat" element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                    <Route path="chat/:sessionId" element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                    <Route
                      path="activity"
                      element={<Navigate to={`/admin/activity/${DEFAULT_ACTIVITY_TAB}`} replace />}
                    />
                    <Route path="activity/:tab" element={<ActivityPage />} />
                    {/* Legacy single-view routes now resolve to their Activity tab. */}
                    <Route path="overview" element={<Navigate to="/admin/activity/overview" replace />} />
                    <Route path="queue" element={<Navigate to="/admin/activity/queue" replace />} />
                    <Route path="audit" element={<Navigate to="/admin/activity/audit" replace />} />
                    <Route path="memories" element={<ConfigSectionRedirect sectionId="memories" />} />
                    <Route path="heartbeats" element={<ConfigSectionRedirect sectionId="beats" />} />
                    <Route path="errands" element={<Navigate to={agentPath('negotiator')} replace />} />
                    <Route path="*" element={<Navigate to={ORCHESTRATOR_PATH} replace />} />
                  </Routes>
                </main>
              </div>
            </div>

            <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Menu">
              <DrawerHeader title="Menu" onClose={() => setNavOpen(false)} />
              <div className="flex min-h-0 flex-1 flex-col">
                <SidebarContent
                  onNavigate={() => setNavOpen(false)}
                  onOpenConfig={() => {
                    setNavOpen(false);
                    handleOpenConfig();
                  }}
                />
              </div>
            </Drawer>

            <ConfigModal open={configOpen} initialSectionId={configSection} onClose={() => setConfigOpen(false)} />
          </div>
        </UiProvider>
      </ChatProvider>
    </ProvidersProvider>
  );
}
