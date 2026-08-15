import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { SessionSummary } from '../../lib/types';
import ChatPage from './ChatPage';
import OverviewPage from './OverviewPage';
import SessionsPage from './SessionsPage';
import MemoriesPage from './MemoriesPage';
import HeartbeatsPage from './HeartbeatsPage';
import ChannelsPage from './ChannelsPage';
import SkillsPage from './SkillsPage';
import SettingsPage from './SettingsPage';
import AuditPage from './AuditPage';
import UsagePage from './UsagePage';
import QueuePage from './QueuePage';
import { ChatProvider, useChat } from '../../lib/chat-context';

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0 fill-none stroke-current"
      style={{ strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  overview: 'M3 3v18h18M7 15l4-6 4 4 4-8',
  sessions: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  memories: 'M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.1 2.5 5.3.8.7 1.5 1.7 1.5 2.7v1h6v-1c0-1 .7-2 1.5-2.7C17.8 13.1 19 11.4 19 9a7 7 0 0 0-7-7zM9 21h6',
  heartbeats: 'M22 12h-4l-3 9L9 3l-3 9H2',
  channels: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  skills: 'M12 2l3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3-5.9 3 1.1-6.4L2.5 9l6.5-1z',
  audit: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  queue: 'M12 3v18M3 7l9-4 9 4M3 17l9 4 9-4M3 7v10M21 7v10M3 12h18',
  settings:
    'M10.3 2h3.4l.4 2.5a8 8 0 0 1 2 .8l2.1-1.4 2.4 2.4-1.4 2.1a8 8 0 0 1 .8 2l2.5.4v3.4l-2.5.4a8 8 0 0 1-.8 2l1.4 2.1-2.4 2.4-2.1-1.4a8 8 0 0 1-2 .8l-.4 2.5h-3.4l-.4-2.5a8 8 0 0 1-2-.8l-2.1 1.4-2.4-2.4 1.4-2.1a8 8 0 0 1-.8-2L2 13.7v-3.4l2.5-.4a8 8 0 0 1 .8-2L3.9 5.8l2.4-2.4 2.1 1.4a8 8 0 0 1 2-.8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
};

const MANAGE_ITEMS: { to: string; label: string; icon: keyof typeof ICONS }[] = [
  { to: '/admin/overview', label: 'Overview', icon: 'overview' },
  { to: '/admin/sessions', label: 'Sessions', icon: 'sessions' },
  { to: '/admin/memories', label: 'Memories', icon: 'memories' },
  { to: '/admin/heartbeats', label: 'Beats', icon: 'heartbeats' },
  { to: '/admin/channels', label: 'Channels', icon: 'channels' },
  { to: '/admin/skills', label: 'Skills', icon: 'skills' },
  { to: '/admin/audit', label: 'Audit', icon: 'audit' },
  { to: '/admin/usage', label: 'Usage', icon: 'overview' },
  { to: '/admin/queue', label: 'Queue', icon: 'queue' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

function navItemClass({ isActive }: { isActive: boolean }, vertical: boolean): string {
  const base = vertical
    ? 'flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt'
    : 'flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] text-txt-2 hover:bg-bg-3 hover:text-txt';
  return isActive ? `${base} bg-accent-muted !text-accent-2 border-accent-muted` : base;
}

function NavItems({ vertical = false, onNavigate }: { vertical?: boolean; onNavigate?: () => void }) {
  return (
    <>
      {MANAGE_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={(state) => navItemClass(state, vertical)}
        >
          <Icon path={ICONS[item.icon]} />
          <span>{item.label}</span>
        </NavLink>
      ))}
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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-subtle bg-bg-2 shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Header({
  navOpen,
  chatsOpen,
  onOpenNav,
  onOpenChats,
}: {
  navOpen: boolean;
  chatsOpen: boolean;
  onOpenNav: () => void;
  onOpenChats: () => void;
}) {
  const { serverHealthy, streaming, currentQuestion, backgroundRun, activeSessionId } = useChat();
  const backgroundActive = !!backgroundRun && backgroundRun.sessionId === activeSessionId;
  const processing = streaming || backgroundActive;
  const statusOnline = serverHealthy && !processing;
  const statusLabel = !serverHealthy ? 'Offline' : processing ? 'Thinking…' : 'Online';

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-subtle bg-bg/80 px-3 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <button
          onClick={onOpenNav}
          aria-label="Open menu"
          aria-expanded={navOpen}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt"
        >
          <Icon path={ICONS.menu} />
        </button>
        <button
          onClick={onOpenChats}
          aria-label="Open chats"
          aria-expanded={chatsOpen}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt md:hidden"
        >
          <Icon path={ICONS.chat} />
        </button>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {processing && currentQuestion && (
          <div className="hidden max-w-[280px] items-center gap-2 rounded-full border border-accent-muted bg-accent-muted px-3 py-1 lg:flex">
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-accent" />
            <span className="truncate text-[11px] text-accent-2">{currentQuestion}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-full border border-subtle bg-bg-3 px-2.5 py-1 font-mono text-[11px] text-txt-3">
          <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${statusOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>
        <div className="ml-1 flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent">
            <img src="/logo.png" alt="koris-agent" className="h-full w-full object-cover" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[13px] font-medium">koris-agent</div>
            <div className="font-mono text-[11px] text-txt-3">Admin panel</div>
          </div>
        </div>
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

  async function handleNewChat() {
    await newChat();
    onNavigate?.();
    navigate('/admin/chat');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-strong bg-bg-3 px-3 py-2 text-[13px] text-txt transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
        >
          <svg className="h-3.5 w-3.5 fill-none stroke-current" style={{ strokeWidth: 2, strokeLinecap: 'round' }} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
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

function Sidebar() {
  return (
    <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-subtle bg-bg-2 md:flex">
      <ChatsPanel />
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
        <Icon path={ICONS.close} />
      </button>
    </div>
  );
}

export default function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);

  return (
    <ChatProvider>
      <div className="relative z-10 flex h-screen w-full flex-col supports-[height:100dvh]:h-dvh">
        <Header
          navOpen={navOpen}
          chatsOpen={chatsOpen}
          onOpenNav={() => setNavOpen(true)}
          onOpenChats={() => setChatsOpen(true)}
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Routes>
              <Route index element={<Navigate to="/admin/chat" replace />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="chat/:sessionId" element={<ChatPage />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="memories" element={<MemoriesPage />} />
              <Route path="heartbeats" element={<HeartbeatsPage />} />
              <Route path="channels" element={<ChannelsPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="queue" element={<QueuePage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>

        <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Menu">
          <DrawerHeader title="Menu" onClose={() => setNavOpen(false)} />
          <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
            <NavItems vertical onNavigate={() => setNavOpen(false)} />
          </div>
        </Drawer>

        <Drawer open={chatsOpen} onClose={() => setChatsOpen(false)} label="Chats" mobileOnly>
          <DrawerHeader title="Chats" onClose={() => setChatsOpen(false)} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatsPanel onNavigate={() => setChatsOpen(false)} />
          </div>
        </Drawer>
      </div>
    </ChatProvider>
  );
}