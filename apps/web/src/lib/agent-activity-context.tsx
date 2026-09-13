import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { agentPath } from './agents';
import { hasUnreadActivity, latestActivity, parseAgentReadState } from './agent-unread';
import { useChat } from './chat-context';
import { loadNegotiatorChat, loadWatcherChat } from './subagent-chat';
import { useReadOnlyData } from './use-read-only-data';
import type { AgentId } from './types';

const STORAGE_KEY = 'koris-agent-read-state';

function useAgentActivityState() {
  const negotiator = useReadOnlyData(loadNegotiatorChat);
  const watcher = useReadOnlyData(loadWatcherChat);
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
      if (!watcher.loading) void watcher.refresh();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [visible, negotiator.loading, negotiator.refresh, watcher.loading, watcher.refresh]);

  const latest = useMemo<Record<AgentId, number>>(() => ({
    orchestrator: latestActivity(messages.filter((message) => message.role === 'assistant' && !message.pending).map((message) => message.at)),
    negotiator: latestActivity((negotiator.data ?? []).flatMap(({ errand, messages: transcript }) => [
      Date.parse(errand.createdAt), Date.parse(errand.lastProgressAt ?? ''), Date.parse(errand.closedAt ?? ''),
      ...transcript.map((message) => Date.parse(message.createdAt)),
    ])),
    watcher: latestActivity((watcher.data?.runs ?? []).map((run) => Date.parse(run.finishedAt))),
  }), [messages, negotiator.data, watcher.data]);

  useEffect(() => {
    if (!visible) return;
    const id = (Object.keys(latest) as AgentId[]).find((agent) => pathname.replace(/\/$/, '') === agentPath(agent));
    if (!id || (id === 'negotiator' && (negotiator.error || negotiator.data?.some((item) => item.error))) || (id === 'watcher' && watcher.error)) return;
    setRead((previous) => hasUnreadActivity(latest[id], previous[id]) ? { ...previous, [id]: latest[id] } : previous);
  }, [pathname, visible, latest, negotiator.error, negotiator.data, watcher.error]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(read));
    } catch {}
  }, [read]);

  return {
    negotiator,
    watcher,
    unread: {
      orchestrator: hasUnreadActivity(latest.orchestrator, read.orchestrator),
      negotiator: hasUnreadActivity(latest.negotiator, read.negotiator),
      watcher: hasUnreadActivity(latest.watcher, read.watcher),
    },
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
