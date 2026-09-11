import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { SessionSummary } from '../../lib/types';
import {
  AuditIcon,
  CloseIcon,
  HeartbeatsIcon,
  MemoriesIcon,
  MenuIcon,
  MoonIcon,
  MoreIcon,
  OverviewIcon,
  PlusIcon,
  QueueIcon,
  SettingsIcon,
  SunIcon,
} from '../../components/Icons';
import ConfigModal from './ConfigModal';
import ContextBar from '../../components/ContextBar';
import { useSaveStates } from '../../lib/config-save-context';
import ChatPage from './ChatPage';
import OverviewPage from './OverviewPage';
import MemoriesPage from './MemoriesPage';
import HeartbeatsPage from './HeartbeatsPage';
import QueuePage from './QueuePage';
import AuditPage from './AuditPage';
import { ChatProvider, useChat } from '../../lib/chat-context';
import { UiProvider } from '../../lib/ui-context';
import { ProvidersProvider } from '../../lib/use-providers';

const NAV_ICONS = {
  overview: OverviewIcon,
  memories: MemoriesIcon,
  heartbeats: HeartbeatsIcon,
  queue: QueueIcon,
  audit: AuditIcon,
};

const MAIN_ITEMS: { to: string; label: string; icon: keyof typeof NAV_ICONS }[] = [
  { to: '/admin/overview', label: 'Overview', icon: 'overview' },
  { to: '/admin/memories', label: 'Memories', icon: 'memories' },
  { to: '/admin/heartbeats', label: 'Beats', icon: 'heartbeats' },
  { to: '/admin/queue', label: 'Queue', icon: 'queue' },
  { to: '/admin/audit', label: 'Audit', icon: 'audit' },
];

function navItemClass({ isActive }: { isActive: boolean }, vertical: boolean, collapsed: boolean): string {
  const base = vertical
    ? `flex w-full items-center rounded-lg border border-transparent py-2.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'}`
    : 'flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt';
  return isActive ? `${base} bg-accent-muted !text-accent-2 border-accent-muted` : base;
}

function NavItems({
  items,
  vertical = false,
  collapsed = false,
  onNavigate,
  role,
}: {
  items: typeof MAIN_ITEMS;
  vertical?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  role?: string;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            role={role}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={(state) => navItemClass(state, vertical, collapsed)}
          >
            <Icon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        );
      })}
    </>
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
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-subtle bg-bg-2 shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const THEME_KEY = 'koris-theme';
const SIDEBAR_KEY = 'koris-sidebar-collapsed';

function getInitialDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) !== 'light';
  } catch {
    return true;
  }
}

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function Header({
  navOpen,
  isDark,
  onOpenNav,
  onToggleCollapse,
  onToggleTheme,
  onOpenConfig,
}: {
  navOpen: boolean;
  isDark: boolean;
  onOpenNav: () => void;
  onToggleCollapse: () => void;
  onToggleTheme: () => void;
  onOpenConfig: (sectionId?: string) => void;
}) {
  const hasConfigError = useSaveStates().some((state) => state.state === 'error' || state.state === 'invalid');

  function handleMenu() {
    if (window.matchMedia('(min-width: 768px)').matches) {
      onToggleCollapse();
    } else {
      onOpenNav();
    }
  }

  return (
    <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-subtle bg-bg/80 px-3 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <button
          onClick={handleMenu}
          aria-label="Toggle sidebar"
          aria-expanded={navOpen}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
        >
          <MenuIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
        </button>
        <div className="ml-1 flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent">
            <img src="/logo.png" alt="koris" className="h-full w-full object-cover" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[13px] font-medium">koris</div>
            <div className="font-mono text-[11px] text-txt-3">Admin panel</div>
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Light mode' : 'Dark mode'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
        >
          {isDark ? (
            <SunIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
          ) : (
            <MoonIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOpenConfig()}
          aria-label="Configuration"
          title={hasConfigError ? 'Configuration · changes need attention' : 'Configuration'}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
        >
          <SettingsIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
          {hasConfigError && (
            <span
              aria-label="Configuration needs attention"
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-400 ring-2 ring-bg"
            />
          )}
        </button>
        <HeaderAppMenu onOpenConfig={onOpenConfig} />
      </div>
    </header>
  );
}

function formatShortDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChatItem({ session, live, onNavigate }: { session: SessionSummary; live: boolean; onNavigate?: () => void }) {
  const { activeSessionId } = useChat();
  const navigate = useNavigate();
  const isActive = session.id === activeSessionId;
  const title = session.preview?.trim() || `Chat ${session.id.slice(0, 8)}`;

  function handleClick() {
    onNavigate?.();
    navigate(`/admin/chat/${session.id}`);
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
        isActive ? 'border-accent-muted bg-accent-muted' : 'border-transparent hover:bg-bg-3'
      }`}
    >
      <div className="truncate text-[13px] text-txt">{title}</div>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-txt-3">
        <span>{formatShortDate(session.startedAt)}</span>
        <span>·</span>
        {live ? (
          <span className="text-green-400">live</span>
        ) : (
          <span>{session.entryChannel}</span>
        )}
      </div>
    </button>
  );
}

function ChatsPanel({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { sessions, newChat } = useChat();
  const navigate = useNavigate();
  const liveWebId = sessions.find((s) => s.entryChannel === 'web' && !s.endedAt)?.id;

  async function handleNewChat() {
    await newChat();
    onNavigate?.();
    navigate('/admin/chat');
  }

  if (collapsed) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-2">
          <button
            onClick={handleNewChat}
            title="New chat"
            className="flex w-full items-center justify-center rounded-lg border border-strong bg-bg-3 px-2 py-2 text-txt transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
          >
            <PlusIcon className="h-3.5 w-3.5 fill-none stroke-current" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-strong bg-bg-3 px-3 py-2 text-[13px] text-txt transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
        >
          <PlusIcon className="h-3.5 w-3.5 fill-none stroke-current" />
          New chat
        </button>
      </div>

      <div className="px-4 pb-1 pt-1 font-mono text-[10px] uppercase tracking-wider text-txt-3">Chats</div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 && (
          <div className="px-3 py-8 text-center font-mono text-[11px] text-txt-3">No chats yet.</div>
        )}
        {sessions.map((session) => (
          <ChatItem
            key={session.id}
            session={session}
            live={session.id === liveWebId}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function ConfigButton({ onOpen, collapsed = false }: { onOpen: () => void; collapsed?: boolean }) {
  const hasError = useSaveStates().some((state) => state.state === 'error' || state.state === 'invalid');
  return (
    <button
      onClick={onOpen}
      aria-label="Configuration"
      title={hasError ? 'Configuration · changes need attention' : collapsed ? 'Configuration' : undefined}
      className={`flex w-full items-center rounded-lg border border-transparent py-2.5 text-[13px] text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt ${
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
      }`}
    >
      <SettingsIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
      {!collapsed && <span>Configuration</span>}
      {hasError && <span aria-label="Changes need attention" className="h-1.5 w-1.5 rounded-full bg-red-400" />}
    </button>
  );
}

function HeaderAppMenu({ onOpenConfig }: { onOpenConfig: (sectionId?: string) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        container.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex === -1 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={container} className="relative hidden md:block z-20">
      <button
        id="app-menu-button"
        type="button"
        aria-label="Admin navigation"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
      >
        <MoreIcon className="h-4 w-4 fill-none stroke-current" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-labelledby="app-menu-button"
          onKeyDown={handleKeyDown}
          className="absolute right-0 top-full z-20 mt-1.5 w-52 rounded-xl border border-strong bg-bg-2 p-1.5 shadow-2xl animate-[modalIn_0.15s_ease-out_both]"
        >
          <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-txt-3">Admin views</div>
          <NavItems items={MAIN_ITEMS} vertical onNavigate={() => setOpen(false)} role="menuitem" />
          <div className="my-1 border-t border-subtle" />
          <ConfigButton
            onOpen={() => {
              container.current?.querySelector('button')?.focus();
              setOpen(false);
              onOpenConfig();
            }}
          />
          <div className="my-1.5 border-t border-subtle" />
          <div className="px-2 py-1.5">
            <ContextBar />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  collapsed = false,
  onOpenConfig,
  onNavigate,
}: {
  collapsed?: boolean;
  onOpenConfig: (sectionId?: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex-shrink-0 space-y-0.5 p-2 pb-1.5">
        <NavItems items={MAIN_ITEMS} vertical collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className="flex-shrink-0 border-t border-subtle" />
      <div className="min-h-0 flex-1">
        <ChatsPanel collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className="flex-shrink-0 space-y-0.5 border-t border-subtle p-2">
        <ConfigButton collapsed={collapsed} onOpen={() => onOpenConfig()} />
      </div>
    </>
  );
}

function Sidebar({
  collapsed,
  onOpenConfig,
}: {
  collapsed: boolean;
  onOpenConfig: (sectionId?: string) => void;
}) {
  return (
    <aside
      className={`relative hidden flex-shrink-0 flex-col border-r border-subtle bg-bg-2 transition-[width] duration-200 md:flex ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="min-h-0 flex-1">
        <ChatsPanel collapsed={collapsed} />
      </div>
      <div className="flex-shrink-0 space-y-0.5 border-t border-subtle p-2">
        <ConfigButton collapsed={collapsed} onOpen={() => onOpenConfig()} />
      </div>
    </aside>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-subtle px-4">
      <span className="text-[13px] font-medium">{title}</span>
      <button
        onClick={onClose}
        aria-label={`Close ${title}`}
        className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
      >
        <CloseIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
      </button>
    </div>
  );
}

export default function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSection, setConfigSection] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [isDark, setIsDark] = useState(getInitialDark);

  function handleOpenConfig(sectionId?: string) {
    if (sectionId) setConfigSection(sectionId);
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

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // storage unavailable — state still applies for this session
    }
  }, [collapsed]);

  return (
    <ProvidersProvider>
      <ChatProvider>
        <UiProvider value={{ openConfig: handleOpenConfig }}>
          <div className="relative z-10 flex h-screen w-full flex-col supports-[height:100dvh]:h-dvh">
            <Header
              navOpen={navOpen}
              isDark={isDark}
              onOpenNav={() => setNavOpen(true)}
              onToggleCollapse={() => setCollapsed((c) => !c)}
              onToggleTheme={() => setIsDark((d) => !d)}
              onOpenConfig={handleOpenConfig}
            />
            <div className="flex min-h-0 flex-1">
              <Sidebar collapsed={collapsed} onOpenConfig={handleOpenConfig} />
              <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <Routes>
                  <Route index element={<Navigate to="/admin/chat" replace />} />
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="chat/:sessionId" element={<ChatPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="memories" element={<MemoriesPage />} />
                  <Route path="heartbeats" element={<HeartbeatsPage />} />
                  <Route path="queue" element={<QueuePage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/admin/chat" replace />} />
                </Routes>
              </main>
            </div>

            <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Menu">
              <DrawerHeader title="Menu" onClose={() => setNavOpen(false)} />
              <div className="flex min-h-0 flex-1 flex-col">
                <SidebarContent
                  onNavigate={() => setNavOpen(false)}
                  onOpenConfig={(sectionId) => {
                    document.querySelector<HTMLButtonElement>('button[aria-label="Toggle sidebar"]')?.focus();
                    setNavOpen(false);
                    handleOpenConfig(sectionId);
                  }}
                />
              </div>
            </Drawer>

            <ConfigModal
              open={configOpen}
              initialSectionId={configSection}
              onClose={() => setConfigOpen(false)}
            />

          </div>
        </UiProvider>
      </ChatProvider>
    </ProvidersProvider>
  );
}
