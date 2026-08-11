import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { renderMarkdown } from '../../lib/markdown';
import { useChat } from '../../lib/chat-context';

const MAX_CHARS = 4000;

const PROMPTS = [
  'Explain how streaming works in the Fetch API',
  'Write a Python function to parse JSON safely',
  'What is the difference between RAG and fine-tuning?',
  'How do I center a div in CSS?',
];

export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { messages, input, setInput, streaming, historyLoaded, toast, submit, fillPrompt, openSession, activeSessionEnded, activeSessionSource, newChat } = useChat();
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync the viewed session with the URL. `null` targets the live chat (latest
  // open web session, creating one when none exists yet).
  useEffect(() => {
    openSession(sessionId ?? null);
  }, [sessionId, openSession]);

  // Auto-scroll to the latest message whenever the conversation changes
  // (new message, streaming delta, or returning to this page with history).
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 130)}px`;
    }
  }, [input]);

  const chatEnded = activeSessionEnded;
  const canEdit = !chatEnded && activeSessionSource === 'web';
  const canSend = canEdit && !streaming && input.trim().length > 0;

  function handlePromptClick(text: string) {
    fillPrompt(text);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) submit();
    }
  }

  async function handleStartNewChat() {
    await newChat();
    navigate('/admin/chat');
  }

  const showEmptyState = historyLoaded && messages.length === 0 && canEdit;
  const footerHint = chatEnded
    ? 'This conversation has ended and is now read-only.'
    : activeSessionSource !== 'web'
      ? 'Read-only — this conversation belongs to another channel.'
      : '↵ send · ⇧↵ newline';
  const charCount = input.length;

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col w-full">
      <div ref={chatRef} className="flex flex-1 flex-col gap-5 overflow-y-auto scroll-smooth px-5 py-6">
        {showEmptyState && (
          <div className="m-auto max-w-sm px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-strong bg-bg-3">
              <svg className="h-6 w-6 stroke-txt-3 fill-none" style={{ strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="mb-2 text-base font-medium">What can I help with?</h2>
            <p className="text-[13px] leading-relaxed text-txt-2">Ask anything — code, concepts, writing, analysis. I&apos;ll think it through with you.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handlePromptClick(p)}
                  className="rounded-full border border-strong bg-bg-3 px-3.5 py-1.5 font-mono text-xs text-txt-2 transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2.5 animate-msg-in ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'assistant' && (
              <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-medium text-white">ai</div>
            )}
            <div className={`bubble-col flex max-w-[calc(100%-44px)] flex-col gap-1 ${m.role === 'user' ? 'items-end' : ''}`}>
              {m.role === 'user' ? (
                <div className="bubble relative break-words rounded-card rounded-br-[5px] bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-white">
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
                  className="bubble relative break-words rounded-card rounded-bl-[5px] border border-subtle bg-bg-3 px-3.5 py-2.5 text-sm leading-relaxed text-txt"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              )}
              {m.timestamp && <span className="px-1 font-mono text-[11px] text-txt-3">{m.timestamp}</span>}
            </div>
          </div>
        ))}

        {chatEnded && (
          <div className="flex flex-col items-center gap-2 pb-1 animate-msg-in">
            <div className="flex items-center gap-2 rounded-full border border-subtle bg-bg-2 px-4 py-2 font-mono text-xs text-txt-3">
              <svg className="h-3.5 w-3.5 fill-none stroke-current" style={{ strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              This conversation has ended
            </div>
            <button
              onClick={handleStartNewChat}
              className="rounded-full border border-strong bg-bg-3 px-3.5 py-1.5 font-mono text-xs text-txt-2 transition-all duration-150 hover:border-accent hover:bg-accent-muted hover:text-accent-2"
            >
              Start a new chat
            </button>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-subtle bg-bg/90 px-4 pb-4 pt-3 backdrop-blur-md">
        <div className={`flex items-start gap-2 rounded-card border px-4 py-2.5 pr-2.5 transition-colors duration-200 ${
          canEdit ? 'border-strong bg-bg-3 focus-within:border-accent' : 'border-subtle bg-bg-2 opacity-70'
        }`}>
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={chatEnded ? 'Conversation ended' : canEdit ? 'Ask something…' : 'Read-only'}
            autoComplete="off"
            value={input}
            maxLength={MAX_CHARS}
            disabled={!canEdit}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-h-32 min-h-[22px] flex-1 resize-none bg-transparent font-sans text-sm leading-snug text-txt outline-none placeholder:text-txt-3 disabled:cursor-not-allowed"
          />
          <button
            disabled={!canSend}
            title="Send message"
            onClick={submit}
            className="relative flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-none bg-accent transition-all duration-150 hover:enabled:opacity-90 active:enabled:scale-95 disabled:opacity-35 disabled:cursor-default"
          >
            <svg className="relative z-10 h-[15px] w-[15px] fill-none stroke-white" style={{ strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }} viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[11px] text-txt-3">
          <span>{footerHint}</span>
          {canEdit && <span className={charCount > MAX_CHARS * 0.85 ? 'text-amber-500' : ''}>{charCount}</span>}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-red-500/30 bg-[#2a1212] px-4 py-2 text-[13px] font-mono text-red-300 animate-toast-in">
          {toast}
        </div>
      )}
    </div>
  );
}
