import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { SessionSummary } from '../../lib/types';
import {
  AuditIcon,
  ChannelsIcon,
  ChatIcon,
  CloseIcon,
  HeartbeatsIcon,
  MemoriesIcon,
  MenuIcon,
  OverviewIcon,
  PlusIcon,
  QueueIcon,
  SessionsIcon,
  SettingsIcon,
  SkillsIcon,
} from '../../components/Icons';
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

const NAV_ICONS = {
  overview: OverviewIcon,
  sessions: SessionsIcon,
  memories: MemoriesIcon,
  heartbeats: HeartbeatsIcon,
  channels: ChannelsIcon,
  skills: SkillsIcon,
  audit: AuditIcon,
  usage: OverviewIcon,
  queue: QueueIcon,
  settings: SettingsIcon,
};

const MANAGE_ITEMS: { to: string; label: string; icon: keyof typeof NAV_ICONS }[] = [
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
      {MANAGE_ITEMS.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <NavLink
            key={item.to}
            to={item.to}
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
  const { serverHealthy, streaming, backgroundRun, activeSessionId } = useChat();
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
          <MenuIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
        </button>
        <button
          onClick={onOpenChats}
          aria-label="Open chats"
          aria-expanded={chatsOpen}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-txt-2 transition-colors duration-150 hover:bg-bg-3 hover:text-txt md:hidden"
        >
          <ChatIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
        </button>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-subtle bg-bg-3 px-2.5 py-1 font-mono text-[11px] text-txt-3">
          <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${statusOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>
        <div className="ml-1 flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent">
            <img src="/logo.png" alt="koris-assistant" className="h-full w-full object-cover" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[13px] font-medium">koris-assistant</div>
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
        <CloseIcon className="h-4 w-4 flex-shrink-0 fill-none stroke-current" />
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