import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import ChatPage from './ChatPage';
import OverviewPage from './OverviewPage';
import SessionsPage from './SessionsPage';
import MemoriesPage from './MemoriesPage';
import HeartbeatsPage from './HeartbeatsPage';
import SkillsPage from './SkillsPage';
import SettingsPage from './SettingsPage';
import { ChatProvider } from '../../lib/chat-context';

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
  skills: 'M12 2l3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3-5.9 3 1.1-6.4L2.5 9l6.5-1z',
  settings:
    'M10.3 2h3.4l.4 2.5a8 8 0 0 1 2 .8l2.1-1.4 2.4 2.4-1.4 2.1a8 8 0 0 1 .8 2l2.5.4v3.4l-2.5.4a8 8 0 0 1-.8 2l1.4 2.1-2.4 2.4-2.1-1.4a8 8 0 0 1-2 .8l-.4 2.5h-3.4l-.4-2.5a8 8 0 0 1-2-.8l-2.1 1.4-2.4-2.4 1.4-2.1a8 8 0 0 1-.8-2L2 13.7v-3.4l2.5-.4a8 8 0 0 1 .8-2L3.9 5.8l2.4-2.4 2.1 1.4a8 8 0 0 1 2-.8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};

const MANAGE_ITEMS: { to: string; label: string; icon: keyof typeof ICONS }[] = [
  { to: '/admin/overview', label: 'Overview', icon: 'overview' },
  { to: '/admin/sessions', label: 'Sessions', icon: 'sessions' },
  { to: '/admin/memories', label: 'Memories', icon: 'memories' },
  { to: '/admin/heartbeats', label: 'Beats', icon: 'heartbeats' },
  { to: '/admin/skills', label: 'Skills', icon: 'skills' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

function navClass({ isActive }: { isActive: boolean }): string {
  const base = 'flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left font-mono text-[13px] text-txt-2 hover:bg-bg-3';
  return isActive ? `${base} bg-accent-muted !text-accent-2 border-accent-muted` : base;
}

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: keyof typeof ICONS; end?: boolean }): ReactNode {
  return (
    <NavLink to={to} end={end} className={navClass}>
      <Icon path={ICONS[icon]} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AdminLayout() {
  return (
    <div className="relative z-10 flex h-screen w-full">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-subtle bg-bg-2 px-3 py-4">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-accent">
            <svg className="h-4 w-4 stroke-white fill-none stroke-2" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }} viewBox="0 0 24 24">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-medium">koris-agent</div>
            <div className="font-mono text-[11px] text-txt-3">Admin panel</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <NavItem to="/admin" label="Chat" icon="chat" end />
        </nav>

        <div className="mt-5 border-t border-subtle pt-4">
          <div className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-wider text-txt-3">Manage</div>
          <nav className="flex flex-col gap-1">
            {MANAGE_ITEMS.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatProvider>
          <Routes>
            <Route index element={<ChatPage />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="memories" element={<MemoriesPage />} />
            <Route path="heartbeats" element={<HeartbeatsPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </ChatProvider>
      </main>
    </div>
  );
}
