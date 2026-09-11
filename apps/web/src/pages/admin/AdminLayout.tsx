import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { SessionSummary } from '../../lib/types';
import {
  AuditIcon,
  CloseIcon,
  MenuIcon,
  MoreIcon,
  OverviewIcon,
  PlusIcon,
  QueueIcon,
  SettingsIcon,
} from '../../components/Icons';
import ConfigModal from './ConfigModal';
import { useSaveStates } from '../../lib/config-save-context';
import ChatPage from './ChatPage';
import OverviewPage from './OverviewPage';
import QueuePage from './QueuePage';
import AuditPage from './AuditPage';
import { ChatProvider, useChat } from '../../lib/chat-context';
import { UiProvider, useUi } from '../../lib/ui-context';
import { ProvidersProvider } from '../../lib/use-providers';

const NAV_ICONS = {
  overview: OverviewIcon,
  queue: QueueIcon,
  audit: AuditIcon,
};

const MAIN_ITEMS: { to: string; label: string; icon: keyof typeof NAV_ICONS }[] = [
  { to: '/admin/overview', label: 'Overview', icon: 'overview' },
  { to: '/admin/queue', label: 'Queue', icon: 'queue' },
  { to: '/admin/audit', label: 'Audit', icon: 'audit' },
];

function navItemClass({ isActive }: { isActive: boolean }, vertical: boolean): string {
  const base = vertical
    ? 'flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt'
    : 'flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt';
  return isActive ? `${base} bg-accent-muted !text-accent-2 border-accent-muted` : base;
}

function NavItems({
  items,
  vertical = false,
  onNavigate,
  role,
}: {
  items: typeof MAIN_ITEMS;
  vertical?: boolean;
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
            className={(state) => navItemClass(state, vertical)}
          >
            <Icon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
            <span>{item.label}</span>
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

function getInitialDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) !== 'light';
  } catch {
    return true;
  }
}

function Header({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-subtle bg-bg/80 px-3 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt md:hidden"
        >
          <MenuIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
        </button>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <HeaderAppMenu />
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

function ChatsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { sessions, newChat } = useChat();
  const navigate = useNavigate();
  const liveWebId = sessions.find((s) => s.entryChannel === 'web' && !s.endedAt)?.id;
  const [query, setQuery] = useState('');

  async function handleNewChat() {
    await newChat();
    onNavigate?.();
    navigate('/admin/chat');
  }

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? sessions.filter((s) => (s.preview?.trim() || `Chat ${s.id.slice(0, 8)}`).toLowerCase().includes(trimmed))
    : sessions;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-txt-3">Chats</div>
        <button
          onClick={handleNewChat}
          title="New chat"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-strong bg-bg-3 text-txt transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
        >
          <PlusIcon className="h-3.5 w-3.5 fill-none stroke-current" />
        </button>
      </div>
      <div className="px-3 pb-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          className="w-full rounded-lg border border-strong bg-bg-3/60 px-2.5 py-1.5 text-[12px] text-txt outline-none transition-colors placeholder:text-txt-3 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center font-mono text-[11px] text-txt-3">
            {trimmed ? 'No matching chats.' : 'No chats yet.'}
          </div>
        )}
        {filtered.map((session) => (
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

function ConfigButton({ onOpen }: { onOpen: () => void }) {
  const hasError = useSaveStates().some((state) => state.state === 'error' || state.state === 'invalid');
  return (
    <button
      onClick={onOpen}
      aria-label="Configuration"
      title={hasError ? 'Configuration · changes need attention' : undefined}
      className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-[13px] text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
    >
      <SettingsIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
      <span>Configuration</span>
      {hasError && <span aria-label="Changes need attention" className="h-1.5 w-1.5 rounded-full bg-red-400" />}
    </button>
  );
}

function HeaderAppMenu() {
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
    <div ref={container} className="relative z-20">
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
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate, onOpenConfig }: { onNavigate?: () => void; onOpenConfig?: () => void }) {
  return (
    <>
      <div className="min-h-0 flex-1">
        <ChatsPanel onNavigate={onNavigate} />
      </div>
      {onOpenConfig && (
        <div className="flex-shrink-0 border-t border-subtle p-2">
          <ConfigButton onOpen={onOpenConfig} />
        </div>
      )}
    </>
  );
}

function Sidebar() {
  const { openConfig } = useUi();
  return (
    <aside className="relative hidden w-60 flex-shrink-0 flex-col border-r border-subtle bg-bg-2 md:flex">
      <div className="min-h-0 flex-1">
        <ChatsPanel />
      </div>
      <div className="flex-shrink-0 border-t border-subtle p-2">
        <ConfigButton onOpen={() => openConfig()} />
      </div>
    </aside>
  );
}

/** Keeps old page URLs working for views that now live in the Configuration modal. */
function ConfigSectionRedirect({ sectionId }: { sectionId: string }) {
  const { openConfig } = useUi();
  useEffect(() => {
    openConfig(sectionId);
  }, [openConfig, sectionId]);
  return <Navigate to="/admin/chat" replace />;
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
                    <Route index element={<Navigate to="/admin/chat" replace />} />
                    <Route path="chat" element={<ChatPage />} />
                    <Route path="chat/:sessionId" element={<ChatPage />} />
                    <Route path="overview" element={<OverviewPage />} />
                    <Route path="memories" element={<ConfigSectionRedirect sectionId="memories" />} />
                    <Route path="heartbeats" element={<ConfigSectionRedirect sectionId="beats" />} />
                    <Route path="queue" element={<QueuePage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="*" element={<Navigate to="/admin/chat" replace />} />
                  </Routes>
                </main>
              </div>
            </div>

            <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Menu">
              <DrawerHeader title="Menu" onClose={() => setNavOpen(false)} />
              <div className="flex min-h-0 flex-1 flex-col">
                <SidebarContent
                  onNavigate={() => setNavOpen(false)}
                  onOpenConfig={() => { setNavOpen(false); handleOpenConfig(); }}
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
