import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { checkHealth, streamChat, apiRequest } from './api';

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

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate the conversation from the backend's persisted "web" session once,
  // so a page load (or first visit) shows the existing history instead of
  // starting blank. Subsequent client-side navigation reuses this same state
  // via context, so the conversation is never lost while browsing admin pages.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const history = await apiRequest<ChatHistoryResponse>('/chat/history');
        if (cancelled) return;

        setMessages(history.messages.map((m) => ({
          id: nextId(),
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          timestamp: timeStr(new Date(m.createdAt)),
        })));
      } catch {
        // No prior session yet, or history unavailable — start with a blank chat.
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

    setStreaming(true);
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text, timestamp: timeStr(new Date()) };
    const assistantId = nextId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', pending: true, timestamp: '' }]);
    setInput('');

    let accumulated = '';

    try {
      await streamChat(
        text,
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
    }
  }, [input, streaming]);

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
