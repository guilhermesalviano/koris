import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { checkHealth, streamChat, apiRequest } from './api';
import type { SessionDetailResponse, SessionsResponse, SessionSummary } from './types';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  pending?: boolean;
  timestamp: string;
}

interface ChatHistoryResponse {
  sessionId: string | null;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}

interface ChatContextValue {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  streaming: boolean;
  serverHealthy: boolean;
  historyLoaded: boolean;
  toast: string | null;
  submit: () => Promise<void>;
  fillPrompt: (text: string) => void;
  activeSessionId: string | null;
  activeSessionEnded: boolean;
  activeSessionSource: string | null;
  sessions: SessionSummary[];
  openSession: (id: string | null) => void;
  newChat: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const HEALTH_CHECK_MS = 5000;

let idCounter = 0;
function nextId(): number {
  idCounter += 1;
  return idCounter;
}

function timeStr(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mapMessages(messages: { id: string; role: string; content: string; createdAt: string }[]): ChatMessage[] {
  return messages.map((m) => ({
    id: nextId(),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    timestamp: timeStr(new Date(m.createdAt)),
  }));
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionEnded, setActiveSessionEnded] = useState(false);
  const [activeSessionSource, setActiveSessionSource] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const loadToken = useRef(0);

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiRequest<SessionsResponse>('/sessions?limit=50');
      setSessions(res.items);
    } catch {
      // Keep the current list if the request fails.
    }
  }, []);

  // Loads a session into view. `null` targets the live chat (latest open web
  // session), creating one when none exists yet. A token guards against stale
  // responses when switching sessions quickly.
  const loadSession = useCallback(async (target: string | null) => {
    const token = ++loadToken.current;
    setHistoryLoaded(false);

    try {
      if (target === null) {
        const history = await apiRequest<ChatHistoryResponse>('/chat/history');
        if (token !== loadToken.current) return;

        if (history.sessionId) {
          setActiveSessionId(history.sessionId);
          setActiveSessionEnded(false);
          setActiveSessionSource('web');
          setMessages(mapMessages(history.messages));
        } else {
          const created = await apiRequest<SessionSummary>('/sessions', { method: 'POST' });
          if (token !== loadToken.current) return;

          setActiveSessionId(created.id);
          setActiveSessionEnded(false);
          setActiveSessionSource('web');
          setMessages([]);
          loadSessions();
        }
      } else {
        const detail = await apiRequest<SessionDetailResponse>(`/sessions/${target}`);
        if (token !== loadToken.current) return;

        setActiveSessionId(detail.session.id);
        setActiveSessionEnded(Boolean(detail.session.endedAt));
        setActiveSessionSource(detail.session.source);
        setMessages(mapMessages(detail.messages));
      }
    } catch {
      if (token !== loadToken.current) return;
      setActiveSessionId(target);
      setActiveSessionEnded(false);
      setActiveSessionSource(target === null ? null : 'web');
      setMessages([]);
    } finally {
      if (token === loadToken.current) setHistoryLoaded(true);
    }
  }, [loadSessions]);

  const openSession = useCallback((id: string | null) => {
    loadSession(id);
  }, [loadSession]);

  const newChat = useCallback(async () => {
    try {
      const created = await apiRequest<SessionSummary>('/sessions', { method: 'POST' });
      loadToken.current += 1;
      setActiveSessionId(created.id);
      setActiveSessionEnded(false);
      setActiveSessionSource('web');
      setMessages([]);
      setHistoryLoaded(true);
      await loadSessions();
    } catch {
      await loadSession(null);
    }
  }, [loadSessions, loadSession]);

  // Populate the sidebar list on mount. The chat page drives session loading.
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const healthy = await checkHealth();
      if (!cancelled) setServerHealthy(healthy);
    };

    poll();
    const interval = setInterval(poll, HEALTH_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fillPrompt = useCallback((text: string) => {
    setInput(text);
  }, []);

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (activeSessionEnded || activeSessionSource !== 'web' || !activeSessionId) return;

    setStreaming(true);
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text, timestamp: timeStr(new Date()) };
    const assistantId = nextId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', pending: true, timestamp: '' }]);
    setInput('');

    let accumulated = '';

    try {
      await streamChat(
        text,
        activeSessionId,
        (status) => {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status, pending: true } : m)));
        },
        (chunk) => {
          accumulated += chunk;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, pending: false, status: undefined } : m)));
        },
      );

      setMessages((prev) => prev.map((m) => (m.id === assistantId
        ? { ...m, content: accumulated || 'No response.', pending: false, status: undefined, timestamp: timeStr(new Date()) }
        : m)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setMessages((prev) => prev.map((m) => (m.id === assistantId
        ? { ...m, content: msg, pending: false, status: undefined, timestamp: timeStr(new Date()) }
        : m)));
      setServerHealthy(false);
      setToast(`Error: ${msg}`);
    } finally {
      setStreaming(false);
      loadSessions();
    }
  }, [input, streaming, activeSessionId, activeSessionEnded, activeSessionSource, loadSessions]);

  const value: ChatContextValue = {
    messages,
    input,
    setInput,
    streaming,
    serverHealthy,
    historyLoaded,
    toast,
    submit,
    fillPrompt,
    activeSessionId,
    activeSessionEnded,
    activeSessionSource,
    sessions,
    openSession,
    newChat,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
