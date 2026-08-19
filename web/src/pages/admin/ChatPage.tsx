import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { renderMarkdown } from '../../lib/markdown';
import { useChat } from '../../lib/chat-context';
import { usePageTitle } from '../../lib/use-page-title';
import ImageLightbox from '../../components/ImageLightbox';
import { AttachIcon, BrokenImageIcon, ChatIcon, CloseIcon, SendIcon } from '../../components/Icons';
import type { ImageAttachment } from '../../lib/types';

const MAX_CHARS = 4000;

const PROMPTS = [
  'Explain how streaming works in the Fetch API',
  'Write a Python function to parse JSON safely',
  'What is the difference between RAG and fine-tuning?',
  'How do I center a div in CSS?',
];

function imageSrc(image: ImageAttachment): string {
  return `data:${image.mimeType ?? 'image/png'};base64,${image.data}`;
}

export default function ChatPage() {
  const { sessionId } = useParams();
  const { messages, input, setInput, attachments, setAttachments, streaming, historyLoaded, toast, submit, fillPrompt, openSession, sessions, activeSessionId } = useChat();
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ images: ImageAttachment[]; index: number } | null>(null);
  const activeTitle = activeSessionId ? sessions.find((s) => s.id === activeSessionId)?.preview?.trim() : undefined;

  usePageTitle(activeTitle || 'Chat', 'Chat with the koris-assistant agent');

  // Sync the viewed session with the URL. `null` targets the live chat (latest
  // open web session, without creating one).
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

  const canSend = !streaming && (input.trim().length > 0 || attachments.length > 0);

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

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    addFiles(Array.from(files));
  }

  function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    for (const file of images) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
        setAttachments((prev) => [...prev, { data: base64, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function cyclePreview(direction: number) {
    setPreview((p) => (p ? { ...p, index: (p.index + direction + p.images.length) % p.images.length } : p));
  }

  const showEmptyState = historyLoaded && messages.length === 0;
  const footerHint = '↵ send · ⇧↵ newline';
  const charCount = input.length;

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col w-full">
      <div ref={chatRef} className="flex flex-1 flex-col gap-5 overflow-y-auto scroll-smooth px-5 py-6">
        {showEmptyState && (
          <div className="m-auto max-w-sm px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-strong bg-bg-3">
              <ChatIcon className="h-6 w-6 fill-none stroke-txt-3" />
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
                  className="bubble relative break-words rounded-card rounded-bl-[5px] border border-subtle bg-bg-3 px-3.5 py-2.5 text-sm leading-relaxed text-txt"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                />
              )}
              {m.timestamp && <span className="px-1 font-mono text-[11px] text-txt-3">{m.timestamp}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 border-t border-subtle bg-bg/90 px-4 pb-4 pt-3 backdrop-blur-md">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((img, i) => (
              <div key={i} className="relative">
                <button
                  type="button"
                  onClick={() => setPreview({ images: attachments, index: i })}
                  title="View image"
                  className="block h-16 w-16 overflow-hidden rounded-lg border border-strong transition-transform duration-150 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <img src={imageSrc(img)} alt={`attachment ${i + 1}`} className="h-full w-full cursor-zoom-in object-cover" />
                </button>
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-strong bg-bg text-txt-2 hover:text-red-400"
                  title="Remove image"
                >
                  <CloseIcon className="h-3 w-3 fill-none stroke-current" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-start gap-2 rounded-card border border-strong bg-bg-3 px-4 py-2.5 pr-2.5 transition-colors duration-200 focus-within:border-accent">
          <button
            type="button"
            disabled={streaming}
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] border-none bg-transparent text-txt-3 transition-all duration-150 hover:bg-bg-2 hover:text-accent-2 disabled:opacity-35 disabled:cursor-default"
          >
            <AttachIcon className="h-[16px] w-[16px] fill-none stroke-current" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask something…"
            autoComplete="off"
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="max-h-32 min-h-[22px] flex-1 resize-none bg-transparent font-sans text-sm leading-snug text-txt outline-none placeholder:text-txt-3"
          />
          <button
            disabled={!canSend}
            title="Send message"
            onClick={submit}
            className="relative flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-none bg-accent transition-all duration-150 hover:enabled:opacity-90 active:enabled:scale-95 disabled:opacity-35 disabled:cursor-default"
          >
            <SendIcon className="relative z-10 h-[15px] w-[15px] fill-none stroke-white" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[11px] text-txt-3">
          <span>{footerHint}</span>
          <span className={charCount > MAX_CHARS * 0.85 ? 'text-amber-500' : ''}>{charCount}</span>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-red-500/30 bg-[#2a1212] px-4 py-2 text-[13px] font-mono text-red-300 animate-toast-in">
          {toast}
        </div>
      )}

      <ImageLightbox
        src={preview ? imageSrc(preview.images[preview.index]) : null}
        caption={preview && preview.images.length > 1 ? `Image ${preview.index + 1} of ${preview.images.length}` : undefined}
        onClose={() => setPreview(null)}
        onPrev={preview && preview.images.length > 1 ? () => cyclePreview(-1) : undefined}
        onNext={preview && preview.images.length > 1 ? () => cyclePreview(1) : undefined}
      />
    </div>
  );
}
