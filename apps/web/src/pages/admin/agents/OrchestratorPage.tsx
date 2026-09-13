import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown, stripMarkdown } from '../../../lib/markdown';
import { useChat, type ChatMessage } from '../../../lib/chat-context';
import { usePageTitle } from '../../../lib/use-page-title';
import { anchoredScrollTop, buildThread, isNearBottom } from '../../../lib/timeline';
import ImageLightbox from '../../../components/ImageLightbox';
import AudioRecognitionModal from '../../../components/chat/AudioRecognitionModal';
import ChatComposer from '../../../components/chat/ChatComposer';
import { DateSeparator } from '../../../components/chat/DateSeparator';
import { imageSrc, readFileAsAttachment } from '../../../components/chat/shared';
import { BrokenImageIcon, PlusIcon, RetryIcon, SpeakerIcon, SquareIcon } from '../../../components/Icons';
import { Button } from '../../../components/ui';
import type { ImageAttachment } from '../../../lib/types';

/** Prepend in progress: the scroll height before it, and the first message then on screen. */
interface ScrollAnchor {
  scrollHeight: number;
  firstId: number | undefined;
}

/**
 * The Orchestrator thread: every web chat session as one conversation, loading
 * older pages as you scroll up, with a divider wherever a new session started.
 */
export default function OrchestratorPage() {
  const {
    messages, input, setInput, attachments, setAttachments, streaming, historyLoaded, toast, setToast, submit, resendLast, cancel,
    activeSessionId, threadSessions, hasOlder, loadingOlder, loadOlder, startNewSession, startingSession,
    gateBlocks, allowDomain, dismissGateBlock, responseMode,
  } = useChat();
  const chatRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<{ images: ImageAttachment[]; index: number } | null>(null);
  const [localToast, setLocalToast] = useState<string | null>(null);

  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [loadingSpeakId, setLoadingSpeakId] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechCacheRef = useRef<Map<number, string>>(new Map());
  const lastAutoPlayedIdRef = useRef<number | null>(null);

  function showToast(msg: string) {
    if (setToast) setToast(msg);
    setLocalToast(msg);
    setTimeout(() => setLocalToast(null), 3000);
  }


  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setSpeakingId(null);
  }

  async function handleSpeak(m: ChatMessage) {
    if (speakingId === m.id) {
      stopPlayback();
      return;
    }

    stopPlayback();

    let url = speechCacheRef.current.get(m.id);
    if (!url) {
      setLoadingSpeakId(m.id);
      try {
        const res = await fetch('/api/audio/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: stripMarkdown(m.content) }),
        });

        if (!res.ok) {
          const isJson = (res.headers.get('content-type') || '').includes('application/json');
          const data = isJson ? await res.json().catch(() => ({})) : null;
          showToast((data && (data as { error?: string }).error) || `Speech failed (${res.status})`);
          return;
        }

        url = URL.createObjectURL(await res.blob());
        speechCacheRef.current.set(m.id, url);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Speech failed');
        return;
      } finally {
        setLoadingSpeakId(null);
      }
    }

    try {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => setSpeakingId(null);
      setSpeakingId(m.id);
      await audio.play();
    } catch (err) {
      setSpeakingId(null);
      if (err instanceof Error && err.name === 'AbortError') return;
      showToast(err instanceof Error ? err.message : 'Audio playback failed');
    }
  }

  useEffect(() => {
    if (responseMode !== 'voice' || streaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.pending || last.error || !last.content) return;
    if (lastAutoPlayedIdRef.current === last.id) return;
    lastAutoPlayedIdRef.current = last.id;
    void handleSpeak(last);
  }, [messages, streaming, responseMode]);

  useEffect(() => {
    const cache = speechCacheRef.current;
    return () => {
      audioRef.current?.pause();
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  usePageTitle('Orchestrator', 'Chat with the koris agent');

  const thread = useMemo(
    () => buildThread(messages, threadSessions, activeSessionId),
    [messages, threadSessions, activeSessionId],
  );
  const activeHasMessages = !!activeSessionId && messages.some((m) => m.sessionId === activeSessionId);

  // Scroll model:
  // - opening the thread starts at the newest message (an instant jump, before paint);
  // - while the reader is at the bottom, new content keeps it there;
  // - scrolled up, new messages leave the view alone and raise the "New messages" pill;
  // - loading an older page above keeps the visible messages in place.
  // The container sets `overflow-anchor: none` so the browser's own scroll
  // anchoring doesn't also shift the view on prepend.
  const stickToBottomRef = useRef(true);
  const positionedRef = useRef(false);
  const lastMessageIdRef = useRef<number | undefined>(undefined);
  const firstMessageIdRef = useRef<number | undefined>(undefined);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = chatRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setShowNewMessages(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  function handleScroll() {
    const el = chatRef.current;
    if (!el) return;
    stickToBottomRef.current = isNearBottom(el);
    if (stickToBottomRef.current) setShowNewMessages(false);
  }

  useLayoutEffect(() => {
    const el = chatRef.current;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const appended = last !== lastMessageIdRef.current;
    lastMessageIdRef.current = last;
    firstMessageIdRef.current = first;

    if (!el) {
      positionedRef.current = false;
      return;
    }

    const anchor = anchorRef.current;
    if (anchor && first !== anchor.firstId) {
      anchorRef.current = null;
      el.scrollTo({ top: anchoredScrollTop(anchor.scrollHeight, el.scrollTop, el.scrollHeight), behavior: 'instant' });
      return;
    }
    if (anchor && !loadingOlder) anchorRef.current = null;

    if (!positionedRef.current) {
      if (messages.length > 0) {
        positionedRef.current = true;
        scrollToBottom('instant');
      }
      return;
    }

    if (stickToBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    } else if (appended && last !== undefined) {
      setShowNewMessages(true);
    }
  }, [messages, thread.trailing, loadingOlder, scrollToBottom]);

  // Load the previous page when the top of the thread comes into view. The
  // observer is recreated after each page, and reports straight away if the
  // sentinel is still visible (a short thread), so pages keep loading until the
  // view is filled or the history runs out.
  const showEmptyState = historyLoaded && messages.length === 0;

  useEffect(() => {
    const root = chatRef.current;
    const target = topSentinelRef.current;
    if (!root || !target || !hasOlder || loadingOlder || showEmptyState) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || anchorRef.current) return;
      anchorRef.current = { scrollHeight: root.scrollHeight, firstId: firstMessageIdRef.current };
      void loadOlder();
    }, { root, rootMargin: '300px 0px 0px 0px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasOlder, loadingOlder, loadOlder, showEmptyState]);

  function send(text?: string) {
    stickToBottomRef.current = true;
    return submit(text);
  }

  function handleResend() {
    stickToBottomRef.current = true;
    return resendLast();
  }

  const canSend = !streaming && (input.trim().length > 0 || attachments.length > 0);

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    const newAttachments = await Promise.all(images.map(readFileAsAttachment));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function cyclePreview(direction: number) {
    setPreview((p) => (p ? { ...p, index: (p.index + direction + p.images.length) % p.images.length } : p));
  }

  const lastMessageId = messages.length ? messages[messages.length - 1].id : -1;

  // A fresh chat centers the composer — put the cursor in it straight away.
  useEffect(() => {
    if (showEmptyState) textareaRef.current?.focus();
  }, [showEmptyState]);

  const composer = (
    <ChatComposer
      ref={textareaRef}
      input={input}
      onInputChange={setInput}
      onSubmit={() => void send()}
      onCancelStreaming={cancel}
      streaming={streaming}
      canSend={canSend}
      attachments={attachments}
      onAddFiles={addFiles}
      onRemoveAttachment={removeAttachment}
      onPreviewAttachment={(index) => setPreview({ images: attachments, index })}
      onOpenAudioModal={() => setIsAudioModalOpen(true)}
    />
  );

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col w-full">
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-subtle bg-bg/80 px-4 backdrop-blur-md">
        <h1 className="text-body font-medium text-txt">Orchestrator</h1>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void startNewSession()}
          disabled={streaming || !activeHasMessages}
          loading={startingSession}
          iconLeft={<PlusIcon className="h-3.5 w-3.5 fill-none stroke-current" />}
          title={activeHasMessages ? 'End this session and start a fresh one' : 'The current session is still empty'}
        >
          New session
        </Button>
      </header>
      {showEmptyState ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <h2 className="text-center text-xl font-medium">What can I help with?</h2>
          <div className="w-full max-w-2xl">{composer}</div>
        </div>
      ) : (
        <>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={chatRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6 [overflow-anchor:none]"
      >
        <div ref={topSentinelRef} aria-hidden="true" />
        {hasOlder ? (
          <div className="text-center font-mono text-micro text-txt-3" aria-live="polite">
            {loadingOlder ? 'Loading earlier messages…' : '\u00a0'}
          </div>
        ) : messages.length > 0 ? (
          <div className="text-center font-mono text-micro text-txt-3">Beginning of history</div>
        ) : null}
        {thread.items.map(({ message: m, divider }) => {
          return (
          <Fragment key={m.id}>
          {divider && (
            <DateSeparator
              label={divider.label}
              session={divider.kind === 'session'}
              summary={divider.kind === 'session' ? divider.summary : null}
            />
          )}
          <div className={`flex gap-2.5 animate-msg-in ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'assistant' && (
              <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-medium text-white">ai</div>
            )}
            <div className={`bubble-col flex max-w-[calc(100%-44px)] flex-col gap-1 ${m.role === 'user' ? 'items-end' : ''}`}>
              {m.role === 'user' ? (
                <div className="bubble relative break-words rounded-card rounded-br-[5px] bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-white">
                  {(m.images && m.images.length > 0) || (m.missingImages ?? 0) > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {m.images?.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPreview({ images: m.images ?? [], index: i })}
                          title="View image"
                          className="group overflow-hidden rounded-md transition-transform duration-150 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          <img src={imageSrc(img)} alt={`attachment ${i + 1}`} className="h-20 max-w-[140px] cursor-zoom-in rounded-md object-cover transition-opacity duration-150 group-hover:opacity-90" />
                        </button>
                      ))}
                      {Array.from({ length: m.missingImages ?? 0 }).map((_, i) => (
                        <div key={`missing-${i}`} className="group relative flex h-20 w-[140px] cursor-default items-center justify-center rounded-md border border-dashed border-txt-3/40 bg-bg-3">
                          <BrokenImageIcon className="h-7 w-7 fill-none stroke-txt-3/50" />
                          <div className="pointer-events-none absolute bottom-full right-0 z-10 mb-1.5 max-w-[220px] rounded-md border border-subtle bg-bg-2 px-2 py-1 text-right font-mono text-[11px] leading-snug text-txt-2 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                            This image was deleted and is no longer accessible
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {m.content}
                </div>
              ) : m.pending && !m.content ? (
                <div className="bubble relative break-words rounded-card rounded-bl-[5px] border border-subtle bg-bg-3 px-3.5 py-2.5 text-sm leading-relaxed text-txt">
                  {m.status ? (
                    <div className="text-sm italic text-txt-3">{m.status}</div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-1">
                      <span className="h-[5px] w-[5px] rounded-full bg-txt-3 animate-blink" />
                      <span className="h-[5px] w-[5px] rounded-full bg-txt-3 animate-blink2" />
                      <span className="h-[5px] w-[5px] rounded-full bg-txt-3 animate-blink3" />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`bubble relative break-words rounded-card rounded-bl-[5px] border px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.error ? 'border-red-500/40 bg-red-500/10 text-txt' : 'border-subtle bg-bg-3 text-txt'
                  }`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              )}
              {m.role === 'assistant' && m.error && m.id === lastMessageId && !streaming && (
                <button
                  onClick={() => void handleResend()}
                  title="Send the last message again"
                  className="mt-0.5 flex items-center gap-1 self-start rounded-lg border border-strong bg-bg-3 px-2 py-1 font-mono text-[11px] text-txt-2 transition-colors duration-150 hover:border-accent hover:text-accent-2"
                >
                  <RetryIcon className="h-3 w-3 fill-none stroke-current" />
                  Resend
                </button>
              )}
              {responseMode === 'voice' && m.role === 'assistant' && !m.pending && !m.error && m.content && !streaming && (
                <button
                  onClick={() => void handleSpeak(m)}
                  disabled={loadingSpeakId === m.id}
                  title={speakingId === m.id ? 'Stop playback' : 'Play as speech'}
                  className="mt-0.5 flex items-center gap-1 self-start rounded-lg border border-strong bg-bg-3 px-2 py-1 font-mono text-[11px] text-txt-2 transition-colors duration-150 hover:border-accent hover:text-accent-2 disabled:opacity-50"
                >
                  {loadingSpeakId === m.id ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                      Loading…
                    </>
                  ) : speakingId === m.id ? (
                    <>
                      <SquareIcon className="h-3 w-3 fill-current" />
                      Stop
                    </>
                  ) : (
                    <>
                      <SpeakerIcon className="h-3 w-3 fill-none stroke-current" />
                      Play
                    </>
                  )}
                </button>
              )}
              {m.timestamp && <span className="px-1 font-mono text-[11px] text-txt-3">{m.timestamp}</span>}
            </div>
          </div>
          </Fragment>
          );
        })}
        {thread.trailing && <DateSeparator label={thread.trailing.label} session summary={thread.trailing.summary} />}
      </div>
      {showNewMessages && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-subtle bg-bg-2 px-3 py-1 font-mono text-micro text-txt-2 shadow-pop transition-colors hover:text-txt"
        >
          ↓ New messages
        </button>
      )}
      </div>

      {gateBlocks.length > 0 && (
        <div className="flex-shrink-0 space-y-1.5 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          {gateBlocks.map((b) => (
            <div key={b.domain} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-txt">
              <span aria-hidden className="text-amber-500">⚠</span>
              <span className="min-w-0">
                A tool call was blocked — <span className="font-mono text-amber-500">{b.domain}</span> is not in{' '}
                <span className="font-mono">allowed_domains</span>. Add it to koris.json to allow it.
              </span>
              <span className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                <button
                  onClick={() => allowDomain(b.domain)}
                  className="rounded-lg border border-amber-500/50 bg-amber-500/15 px-2 py-1 font-mono text-[11px] text-amber-500 transition-colors duration-150 hover:bg-amber-500/25"
                >
                  Add {b.domain}
                </button>
                <button
                  onClick={() => dismissGateBlock(b.domain)}
                  title="Dismiss"
                  className="rounded-lg border border-strong bg-bg-3 px-2 py-1 font-mono text-[11px] text-txt-3 transition-colors duration-150 hover:text-txt"
                >
                  Dismiss
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-shrink-0 border-t border-subtle bg-bg/90 px-4 pb-4 pt-3 backdrop-blur-md">
        <div className="mx-auto w-full max-w-3xl">
          {composer}
        </div>
      </div>
        </>
      )}

      {(toast || localToast) && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-red-500/30 bg-[#2a1212] px-4 py-2 text-[13px] font-mono text-red-300 animate-toast-in">
          {toast || localToast}
        </div>
      )}

      <ImageLightbox
        src={preview ? imageSrc(preview.images[preview.index]) : null}
        caption={preview && preview.images.length > 1 ? `Image ${preview.index + 1} of ${preview.images.length}` : undefined}
        onClose={() => setPreview(null)}
        onPrev={preview && preview.images.length > 1 ? () => cyclePreview(-1) : undefined}
        onNext={preview && preview.images.length > 1 ? () => cyclePreview(1) : undefined}
      />

      <AudioRecognitionModal
        open={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
        streaming={streaming}
        onSend={async (text) => {
          await send(text);
        }}
        onInsert={(text) => {
          const fullText = input.trim() ? `${input.trim()} ${text}` : text;
          setInput(fullText);
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 50);
        }}
      />
    </div>
  );
}
