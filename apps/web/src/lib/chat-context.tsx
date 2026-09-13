import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { checkHealth, streamChat, cancelChat, apiRequest } from './api';
import { clearResponseAlert, triggerResponseDone } from './response-alert';
import { createHistoryPoller, mapMessages, mergeMessages, nextId, timeStr, type ChatMessage } from './chat-history';
import { mergeSessions, prependOlder, sessionFromNewSession, type NewSessionResponse, type SessionMap, type TimelineResponse } from './timeline';
import type { ActiveRun, ActiveRunsResponse, AllowedDomainsResponse, GateBlock, GateBlocksResponse, ImageAttachment } from './types';

export type { ChatMessage } from './chat-history';

const TIMELINE_PATH = '/agents/orchestrator/timeline';
const NEW_SESSION_PATH = '/agents/orchestrator/new-session';
/** Poll-state key: the thread spans sessions, so the poller tracks it as one. */
const THREAD_KEY = 'orchestrator';

function indexSessions(page: TimelineResponse): SessionMap {
  return mergeSessions({}, page.sessions);
}

interface ChatContextValue {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  attachments: ImageAttachment[];
  setAttachments: Dispatch<SetStateAction<ImageAttachment[]>>;
  streaming: boolean;
  currentQuestion: string | null;
  backgroundRun: ActiveRun | null;
  serverHealthy: boolean;
  historyLoaded: boolean;
  toast: string | null;
  setToast: (msg: string | null) => void;
  submit: (overrideText?: string) => Promise<void>;
  resendLast: () => Promise<void>;
  cancel: () => void;
  fillPrompt: (text: string) => void;
  /** The open web session new turns go to; `null` until the first one exists. */
  activeSessionId: string | null;
  /** Sessions of the loaded messages, for drawing session boundaries. */
  threadSessions: SessionMap;
  /** Whether older messages exist above the loaded ones. */
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  /** Ends the open session on the server and starts a fresh one (like `/clear`). */
  startNewSession: () => Promise<void>;
  startingSession: boolean;
  gateBlocks: GateBlock[];
  allowDomain: (domain: string) => Promise<void>;
  dismissGateBlock: (domain: string) => void;
  /** Server-reported reply mode for the active conversation (set via `/mode`). */
  responseMode: 'text' | 'voice';
}

const ChatContext = createContext<ChatContextValue | null>(null);

const HEALTH_CHECK_MS = 5000;
const ACTIVE_RUN_POLL_MS = 4000;
const MESSAGE_POLL_MS = 3500;

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [serverHealthy, setServerHealthy] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [threadSessions, setThreadSessions] = useState<SessionMap>({});
  const [olderCursor, setOlderCursorState] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [backgroundRun, setBackgroundRun] = useState<ActiveRun | null>(null);
  const [gateBlocks, setGateBlocks] = useState<GateBlock[]>([]);
  const [responseMode, setResponseMode] = useState<'text' | 'voice'>('text');
  const dismissedDomainsRef = useRef<Set<string>>(new Set());
  const loadToken = useRef(0);
  const historyLoadingRef = useRef(false);
  const historyGenerationRef = useRef(0);
  const olderCursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  /** Set once an older page is loaded: reloading the newest page must keep its cursor. */
  const loadedOlderRef = useRef(false);
  const startingSessionRef = useRef(false);
  const streamingRef = useRef(false);
  const streamTargetRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const backgroundRunRef = useRef<ActiveRun | null>(null);
  const surfacedRunKeyRef = useRef<string | null>(null);
  const backgroundPendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<{ sessionId: string; userMsg: ChatMessage; assistantId: number; content: string; status: string | null } | null>(null);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    backgroundRunRef.current = backgroundRun;
  }, [backgroundRun]);

  const currentQuestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return null;
  }, [messages]);

  const setOlderCursor = useCallback((cursor: string | null) => {
    olderCursorRef.current = cursor;
    setOlderCursorState(cursor);
  }, []);

  // Loads the newest page of the Orchestrator thread. Pages loaded above it are
  // kept; local turns not yet saved are dropped in favour of the server copy
  // (e.g. the placeholder shown while a background run was processing).
  // A token guards against stale responses.
  const loadThread = useCallback(async () => {
    if (streamTargetRef.current && activeSessionIdRef.current === streamTargetRef.current) {
      // A reply is still being streamed. Keep the in-progress exchange on screen
      // instead of replacing it with history that doesn't include it yet.
      setHistoryLoaded(true);
      return;
    }

    if (backgroundRunRef.current && backgroundRunRef.current.sessionId === activeSessionIdRef.current) {
      // A reply is still being processed in the background (e.g. after a
      // reload). Keep the restored exchange on screen instead of replacing it
      // with history that doesn't include it yet.
      setHistoryLoaded(true);
      return;
    }

    const token = ++loadToken.current;
    historyGenerationRef.current += 1;
    historyLoadingRef.current = true;

    try {
      const page = await apiRequest<TimelineResponse>(TIMELINE_PATH);
      if (token !== loadToken.current) return;

      setActiveSessionId(page.activeSessionId);
      if (loadedOlderRef.current) {
        setThreadSessions((prev) => mergeSessions(prev, page.sessions));
        setMessages((prev) => mergeMessages(prev.filter((m) => !!m.serverId), page.messages));
      } else {
        setThreadSessions(indexSessions(page));
        setMessages(mapMessages(page.messages));
        setOlderCursor(page.nextCursor);
      }
    } catch {
      // Keep what is on screen; the poller retries.
    } finally {
      if (token === loadToken.current) {
        historyLoadingRef.current = false;
        setHistoryLoaded(true);
      }
    }
  }, [setOlderCursor]);

  const loadOlder = useCallback(async () => {
    const cursor = olderCursorRef.current;
    if (!cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await apiRequest<TimelineResponse>(`${TIMELINE_PATH}?before=${encodeURIComponent(cursor)}`);
      loadedOlderRef.current = true;
      setThreadSessions((prev) => mergeSessions(prev, page.sessions));
      setMessages((prev) => prependOlder(prev, page.messages));
      setOlderCursor(page.nextCursor);
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : 'Failed to load earlier messages'}`);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [setOlderCursor]);

  const startNewSession = useCallback(async () => {
    if (streamingRef.current || startingSessionRef.current) return;
    startingSessionRef.current = true;
    setStartingSession(true);
    try {
      const res = await apiRequest<NewSessionResponse>(NEW_SESSION_PATH, { method: 'POST' });
      historyGenerationRef.current += 1;
      activeSessionIdRef.current = res.session.id;
      setActiveSessionId(res.session.id);
      setThreadSessions((prev) => mergeSessions(prev, [sessionFromNewSession(res)]));
      setGateBlocks([]);
      dismissedDomainsRef.current = new Set();
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : 'Failed to start a new session'}`);
    } finally {
      startingSessionRef.current = false;
      setStartingSession(false);
    }
  }, []);

  // Domain-gate blocks: after a turn, a tool call may have been refused because
  // its target host is not in koris.json `allowed_domains`. Surface those so the
  // user can add the domain from the chat.
  const refreshGateBlocks = useCallback(async () => {
    const sid = activeSessionIdRef.current;
    if (!sid) {
      setGateBlocks([]);
      return;
    }
    try {
      const res = await apiRequest<GateBlocksResponse>(`/chat/gate-blocks?sessionId=${encodeURIComponent(sid)}`);
      setGateBlocks(res.blocks.filter((b) => !dismissedDomainsRef.current.has(b.domain)));
    } catch {
      // Non-critical — leave the current list in place.
    }
  }, []);

  const allowDomain = useCallback(async (domain: string) => {
    try {
      await apiRequest<AllowedDomainsResponse>('/allowed-domains', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      setGateBlocks((prev) => prev.filter((b) => b.domain !== domain));
      setToast(`Added ${domain} to allowed_domains`);
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : 'Failed to add domain'}`);
    }
  }, []);

  const dismissGateBlock = useCallback((domain: string) => {
    dismissedDomainsRef.current.add(domain);
    setGateBlocks((prev) => prev.filter((b) => b.domain !== domain));
  }, []);

  useEffect(() => {
    void refreshGateBlocks();
  }, [activeSessionId, refreshGateBlocks]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

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

  // Poll the newest page for messages that arrive outside a local turn (errand
  // escalations or notices, turns from another tab) and for session changes.
  useEffect(() => {
    let latestPage: TimelineResponse | null = null;
    const poller = createHistoryPoller({
      getState: () => {
        const sessionId = activeSessionIdRef.current;
        return {
          sessionId: THREAD_KEY,
          generation: historyGenerationRef.current,
          busy: historyLoadingRef.current
            || streamingRef.current
            || (!!backgroundRunRef.current && backgroundRunRef.current.sessionId === sessionId),
        };
      },
      fetchHistory: async () => {
        latestPage = await apiRequest<TimelineResponse>(TIMELINE_PATH);
        return latestPage.messages;
      },
      // Only reached when the response is still current for this view.
      update: (apply) => {
        const page = latestPage;
        if (page) {
          activeSessionIdRef.current = page.activeSessionId;
          setActiveSessionId(page.activeSessionId);
          setThreadSessions((prev) => mergeSessions(prev, page.sessions));
          if (!loadedOlderRef.current && olderCursorRef.current === null) setOlderCursor(page.nextCursor);
        }
        setMessages(apply);
      },
    });
    void poller.poll();
    const interval = setInterval(() => { void poller.poll(); }, MESSAGE_POLL_MS);
    return () => {
      poller.dispose();
      clearInterval(interval);
    };
  }, [activeSessionId, historyLoaded, streaming, backgroundRun]);

  // Poll for questions still being processed server-side. When the page is
  // reloaded mid-run the SSE stream is gone, so this restores the current
  // question/status until the run finishes and history has the answer.
  useEffect(() => {
    let cancelled = false;
    let lastKey = '';

    const poll = async () => {
      let runs: ActiveRun[] = [];
      try {
        const res = await apiRequest<ActiveRunsResponse>('/active');
        runs = res.items;
      } catch {
        return;
      }
      if (cancelled) return;

      const webRun = runs.find((r) => r.channel === 'web') ?? null;
      const key = webRun ? `${webRun.sessionId}:${webRun.startedAt}` : '';
      if (key !== lastKey) {
        if (lastKey && !key && !streamingRef.current) {
          triggerResponseDone();
        }
        lastKey = key;
        setBackgroundRun(webRun);
      }
    };

    poll();
    const interval = setInterval(poll, ACTIVE_RUN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Surface a background run into the viewed session and refresh the answer of
  // the previous one when it completes.
  useEffect(() => {
    if (streamingRef.current) return;

    const run = backgroundRun && activeSessionId === backgroundRun.sessionId ? backgroundRun : null;
    const prevKey = surfacedRunKeyRef.current;

    if (run && run.startedAt !== prevKey) {
      if (prevKey) {
        surfacedRunKeyRef.current = run.startedAt;
        void loadThread();
        return;
      }
      surfacedRunKeyRef.current = run.startedAt;
    }

    if (run) {
      setMessages((prev) => {
        const alreadyPresent = prev.some((m) => m.backgroundRunKey === run.startedAt);
        let lastUser: ChatMessage | undefined;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'user') {
            lastUser = prev[i];
            break;
          }
        }
        const alreadyAnswered = !!lastUser
          && lastUser.content === run.question
          && prev.some((m) => m.role === 'assistant' && !m.pending && m.id > lastUser.id);
        if (alreadyPresent || alreadyAnswered) return prev;

        backgroundPendingRef.current = true;
        const startedAt = new Date(run.startedAt).getTime();
        const userMsg: ChatMessage = { id: nextId(), role: 'user', content: run.question, timestamp: timeStr(new Date(run.startedAt)), at: startedAt };
        const assistantMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true, status: 'Processing in background…', timestamp: '', at: startedAt, backgroundRunKey: run.startedAt };
        return [...prev, userMsg, assistantMsg];
      });
      return;
    }

    if (prevKey) {
      surfacedRunKeyRef.current = null;
      if (backgroundPendingRef.current) {
        backgroundPendingRef.current = false;
        void loadThread();
      }
    }
  }, [backgroundRun, activeSessionId, loadThread, messages]);

  // Restore the locally-streamed exchange when the user returns to the session
  // it belongs to (e.g. after opening another session, which replaced messages
  // with that session's history). The stream's status/content deltas keep
  // flowing through the same assistant message id.
  useEffect(() => {
    const inFlight = inFlightRef.current;
    if (!inFlight) return;
    if (activeSessionId !== inFlight.sessionId) return;

    setMessages((prev) => {
      if (prev.some((m) => m.id === inFlight.assistantId)) return prev;
      const userMsg: ChatMessage = { ...inFlight.userMsg };
      const assistantMsg: ChatMessage = {
        id: inFlight.assistantId,
        role: 'assistant',
        content: inFlight.content,
        pending: true,
        status: inFlight.status ?? 'Thinking…',
        timestamp: '',
        at: inFlight.userMsg.at,
      };
      return [...prev, userMsg, assistantMsg];
    });
  }, [activeSessionId, messages]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fillPrompt = useCallback((text: string) => {
    setInput(text);
  }, []);

  const sendMessage = useCallback(async (rawText: string, images: ImageAttachment[]) => {
    const text = rawText.trim();
    if ((!text && images.length === 0) || streaming) return;

    setStreaming(true);
    streamingRef.current = true;
    historyGenerationRef.current += 1;
    clearResponseAlert();
    const sentAt = Date.now();
    const sessionId = activeSessionId ?? undefined;
    const userMsg: ChatMessage = { id: nextId(), sessionId, role: 'user', content: text, images, timestamp: timeStr(new Date()), at: sentAt };
    const assistantId = nextId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, sessionId, role: 'assistant', content: '', pending: true, timestamp: '', at: sentAt }]);

    let accumulated = '';

    try {
      let targetId = activeSessionId;
      if (!targetId) {
        const created = await apiRequest<NewSessionResponse>(NEW_SESSION_PATH, { method: 'POST' });
        const newId = created.session.id;
        targetId = newId;
        activeSessionIdRef.current = newId;
        setActiveSessionId(newId);
        setThreadSessions((prev) => mergeSessions(prev, [sessionFromNewSession(created)]));
        userMsg.sessionId = newId;
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id || m.id === assistantId ? { ...m, sessionId: newId } : m)));
      }
      streamTargetRef.current = targetId;
      inFlightRef.current = { sessionId: targetId, userMsg, assistantId, content: '', status: null };
      const controller = new AbortController();
      abortRef.current = controller;

      await streamChat(
        text,
        targetId,
        images,
        (status) => {
          if (inFlightRef.current) inFlightRef.current.status = status;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status, pending: true } : m)));
        },
        (chunk) => {
          accumulated += chunk;
          if (inFlightRef.current) inFlightRef.current.content = accumulated;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, pending: false, status: undefined } : m)));
        },
        controller.signal,
        (rotatedSessionId) => {
          // `/compact`, `/clear` (or the manual-mode auto-compact) ended the
          // current session and opened a fresh one. Follow it so the next turn is
          // routed to the new session (and its resumed summary / memory reach the
          // model). Its start reason arrives with the next timeline poll.
          streamTargetRef.current = rotatedSessionId;
          historyGenerationRef.current += 1;
          if (inFlightRef.current) inFlightRef.current.sessionId = rotatedSessionId;
          activeSessionIdRef.current = rotatedSessionId;
          setActiveSessionId(rotatedSessionId);
          setThreadSessions((prev) => (prev[rotatedSessionId] ? prev : mergeSessions(prev, [{
            id: rotatedSessionId,
            startedAt: new Date().toISOString(),
            endedAt: null,
            startReason: null,
            compactSummary: null,
          }])));
        },
        (mode) => setResponseMode(mode),
      );

      setMessages((prev) => prev.map((m) => (m.id === assistantId
        ? { ...m, content: accumulated || 'No response.', pending: false, status: undefined, timestamp: timeStr(new Date()) }
        : m)));
      triggerResponseDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.map((m) => (m.id === assistantId
          ? { ...m, content: accumulated ? `${accumulated}\n\n_(canceled)_` : '_(canceled)_', pending: false, status: undefined, error: false, timestamp: timeStr(new Date()) }
          : m)));
      } else {
        const msg = err instanceof Error ? err.message : 'Request failed';
        setMessages((prev) => prev.map((m) => (m.id === assistantId
          ? { ...m, content: msg, pending: false, status: undefined, error: true, timestamp: timeStr(new Date()) }
          : m)));
        setServerHealthy(false);
        setToast(`Error: ${msg}`);
      }
    } finally {
      inFlightRef.current = null;
      abortRef.current = null;
      streamingRef.current = false;
      streamTargetRef.current = null;
      setStreaming(false);
      void refreshGateBlocks();
    }
  }, [streaming, activeSessionId, refreshGateBlocks]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    const sid = streamTargetRef.current ?? activeSessionIdRef.current;
    if (sid) void cancelChat(sid);
  }, []);

  const submit = useCallback(async (overrideText?: string) => {
    const text = typeof overrideText === 'string' ? overrideText : input;
    const images = attachments;
    if ((!text.trim() && images.length === 0) || streaming) return;
    setInput('');
    setAttachments([]);
    await sendMessage(text, images);
  }, [input, attachments, streaming, sendMessage]);

  // Re-send the last question (text + images) after a provider error, so the
  // user doesn't retype. Keeps the failed turn on screen; appends a fresh try.
  const resendLast = useCallback(async () => {
    if (streaming) return;
    let lastUser: ChatMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUser = messages[i]; break; }
    }
    if (!lastUser) return;
    await sendMessage(lastUser.content, lastUser.images ?? []);
  }, [messages, streaming, sendMessage]);

  const value: ChatContextValue = {
    messages,
    input,
    setInput,
    attachments,
    setAttachments,
    streaming,
    currentQuestion,
    backgroundRun,
    serverHealthy,
    historyLoaded,
    toast,
    setToast,
    submit,
    resendLast,
    cancel,
    fillPrompt,
    activeSessionId,
    threadSessions,
    hasOlder: olderCursor !== null,
    loadingOlder,
    loadOlder,
    startNewSession,
    startingSession,
    gateBlocks,
    allowDomain,
    dismissGateBlock,
    responseMode,
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
