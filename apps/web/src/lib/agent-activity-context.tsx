import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { agentPath } from './agents';
import { hasUnreadActivity, latestActivity, parseAgentReadState } from './agent-unread';
import { useChat } from './chat-context';
import { loadNegotiatorChat, loadWatcherChat } from './subagent-chat';
import { useReadOnlyData } from './use-read-only-data';
import type { AgentId } from './types';

const STORAGE_KEY = 'koris-agent-read-state';

interface AgentActivity {
  latest: number;
  failed: boolean;
}

function useAgentActivityState() {
  const negotiator = useReadOnlyData(loadNegotiatorChat);
  const heartbeat = useReadOnlyData(loadWatcherChat);
  const { messages } = useChat();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(() => !document.hidden);
  const [read, setRead] = useState(() => {
    try {
      return parseAgentReadState(localStorage.getItem(STORAGE_KEY));
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      if (!negotiator.loading) void negotiator.refresh();
      if (!heartbeat.loading) void heartbeat.refresh();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [visible, negotiator.loading, negotiator.refresh, heartbeat.loading, heartbeat.refresh]);

  const activity = useMemo<Record<AgentId, AgentActivity>>(() => ({
    orchestrator: {
      latest: latestActivity(messages.filter((message) => message.role === 'assistant' && !message.pending).map((message) => message.at)),
      failed: false,
    },
    negotiator: {
      latest: latestActivity((negotiator.data ?? []).flatMap(({ errand, messages: transcript }) => [
        Date.parse(errand.createdAt), Date.parse(errand.lastProgressAt ?? ''), Date.parse(errand.closedAt ?? ''),
        ...transcript.map((message) => Date.parse(message.createdAt)),
      ])),
      failed: Boolean(negotiator.error || negotiator.data?.some((item) => item.error)),
    },
    heartbeat: {
      latest: latestActivity((heartbeat.data?.runs ?? []).map((run) => Date.parse(run.finishedAt))),
      failed: Boolean(heartbeat.error),
    },
  }), [messages, negotiator.data, negotiator.error, heartbeat.data, heartbeat.error]);

  useEffect(() => {
    if (!visible) return;
    const id = Object.keys(activity).find((agent) => pathname.replace(/\/$/, '') === agentPath(agent));
    if (!id || activity[id].failed) return;
    const { latest } = activity[id];
    setRead((previous) => hasUnreadActivity(latest, previous[id]) ? { ...previous, [id]: latest } : previous);
  }, [pathname, visible, activity]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(read));
    } catch {}
  }, [read]);

  return {
    negotiator,
    heartbeat,
    unread: Object.fromEntries(
      Object.entries(activity).map(([id, { latest }]) => [id, hasUnreadActivity(latest, read[id])]),
    ) as Partial<Record<AgentId, boolean>>,
  };
}

const AgentActivityContext = createContext<ReturnType<typeof useAgentActivityState> | null>(null);

export function AgentActivityProvider({ children }: { children: ReactNode }) {
  const value = useAgentActivityState();
  return <AgentActivityContext.Provider value={value}>{children}</AgentActivityContext.Provider>;
}

export function useAgentActivity() {
  const context = useContext(AgentActivityContext);
  if (!context) throw new Error('useAgentActivity must be used within an AgentActivityProvider');
  return context;
}
