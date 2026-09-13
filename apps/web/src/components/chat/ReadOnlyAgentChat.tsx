import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AgentAvatar } from '../AgentAvatar';
import { Button } from '../ui';
import { DateSeparator } from './DateSeparator';
import { chatSeparatorLabel, dayTimeLabel } from '../../lib/date';
import { cn } from '../../lib/cn';
import { renderMarkdown } from '../../lib/markdown';
import { isNearBottom } from '../../lib/timeline';
import { usePageTitle } from '../../lib/use-page-title';
import type { AgentId } from '../../lib/types';
import type { ReadOnlyChatEntry } from '../../lib/subagent-chat';

interface ReadOnlyAgentChatProps {
  agentId: AgentId;
  title: string;
  entries: readonly ReadOnlyChatEntry[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  emptyText: string;
  historyLabel: string;
  onRefresh: () => void;
  actions?: ReactNode;
  /** Per-entry controls (e.g. errand actions); the chat is no longer labelled read-only when set. */
  renderEntryActions?: (entry: ReadOnlyChatEntry) => ReactNode;
  children?: ReactNode;
}

export function ReadOnlyChatMessage({ entry, agentId, actions }: { entry: ReadOnlyChatEntry; agentId: AgentId; actions?: ReactNode }) {
  const contact = entry.kind === 'contact';
  const task = entry.kind === 'task';
  const notices = entry.details?.filter((detail) => ['Unsent draft', 'Question awaiting your answer', 'Delivery incomplete', 'Conversation unavailable'].includes(detail.label));
  return (
    <article data-entry-id={entry.id} className={cn('flex min-w-0 gap-2.5', contact && 'flex-row-reverse')}>
      {!contact && !task && <AgentAvatar id={agentId} className="mt-1 h-7 w-7" />}
      <div className={cn('flex min-w-0 max-w-[calc(100%-44px)] flex-col gap-1', contact && 'items-end', task && 'mx-auto w-full max-w-2xl')}>
        <div className={cn('flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-caption', contact && 'justify-end')}>
          <span className="font-medium text-txt">{entry.author}</span>
          <span className="min-w-0 break-words text-txt-3">{entry.context}</span>
        </div>
        <div className={cn(
          'bubble min-w-0 max-w-full break-words rounded-card border px-3.5 py-2.5 text-sm leading-relaxed',
          contact ? 'rounded-br-[5px] border-transparent bg-accent text-white' : 'rounded-bl-[5px] border-subtle bg-bg-3 text-txt',
          task && 'border-dashed bg-bg-2',
          entry.error && 'border-danger bg-danger-muted text-txt',
        )}>
          {entry.status && <div className="mb-1 font-mono text-micro text-txt-3">{task ? 'Current status: ' : ''}{entry.status}</div>}
          {entry.kind === 'assistant' ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} /> : <div className="whitespace-pre-wrap">{entry.content}</div>}
          {Boolean(entry.details?.length) && (
            <details className="mt-2 border-t border-subtle pt-2">
              <summary className="cursor-pointer text-caption text-txt-2">
                {task ? 'Current errand details' : 'Activity details'}
                {notices?.map((notice) => ` · ${notice.label}`).join('')}
              </summary>
              <dl className="mt-2 space-y-3">
                {entry.details?.map((detail) => (
                  <div key={detail.label}>
                    <dt className="text-caption font-medium text-txt-2">{detail.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-caption text-txt">{detail.content}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
        {actions}
        <time dateTime={new Date(entry.at).toISOString()} className="px-1 font-mono text-micro text-txt-3">
          {task && 'Started '}{dayTimeLabel(entry.at)}
        </time>
      </div>
    </article>
  );
}

export function ReadOnlyAgentChat({ agentId, title, entries, loading, loaded, error, emptyText, historyLabel, onRefresh, actions, renderEntryActions, children }: ReadOnlyAgentChatProps) {
  usePageTitle(title, renderEntryActions ? 'Agent chat' : 'Read-only agent chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const positioned = useRef(false);
  const lastEntryId = useRef<string | undefined>(undefined);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const [newMessages, setNewMessages] = useState(false);

  function rememberPosition() {
    const element = scrollRef.current;
    if (!element) return;
    following.current = isNearBottom(element);
    if (following.current) {
      setNewMessages(false);
      anchor.current = null;
      return;
    }
    const top = element.getBoundingClientRect().top;
    const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find((message) => message.getBoundingClientRect().bottom > top);
    anchor.current = visible ? { id: visible.dataset.entryId!, top: visible.getBoundingClientRect().top - top } : null;
  }

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (entries.length === 0) {
      following.current = true;
      positioned.current = false;
      lastEntryId.current = undefined;
      anchor.current = null;
      setNewMessages(false);
      return;
    }
    const last = entries[entries.length - 1].id;
    if (!positioned.current || following.current) {
      element.scrollTop = element.scrollHeight;
      positioned.current = true;
    } else {
      if (anchor.current) {
        const saved = anchor.current;
        const message = Array.from(element.querySelectorAll<HTMLElement>('[data-entry-id]')).find((item) => item.dataset.entryId === saved.id);
        if (message) element.scrollTop += message.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.top;
      }
      if (last !== lastEntryId.current) setNewMessages(true);
    }
    lastEntryId.current = last;
  }, [entries]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-12 flex-shrink-0 flex-wrap items-center gap-2 border-b border-subtle bg-bg/80 px-4 py-2 backdrop-blur-md">
        <AgentAvatar id={agentId} className="h-8 w-8" />
        <h1 className="text-body font-medium text-txt">{title}</h1>
        {!renderEntryActions && <span className="font-mono text-micro text-txt-3">Read-only</span>}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Button size="sm" variant="ghost" loading={loading} onClick={onRefresh}>Refresh</Button>
        </div>
      </header>
      {error && (
        <div role="alert" className="flex flex-shrink-0 items-center gap-3 border-b border-danger bg-danger-muted px-4 py-2 text-caption text-txt">
          <span className="min-w-0 break-words">{error}{loaded && ' Previously loaded history is still shown.'}</span>
          <Button size="sm" variant="ghost" disabled={loading} onClick={onRefresh}>Retry</Button>
        </div>
      )}
      <div ref={scrollRef} onScroll={rememberPosition} aria-label={`${title} conversation`} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 [overflow-anchor:none] sm:px-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {children}
          {!loaded && loading && <p role="status" className="py-12 text-center text-caption text-txt-3">Loading conversation…</p>}
          {loaded && entries.length === 0 && <p className="py-12 text-center text-body text-txt-3">{emptyText}</p>}
          {entries.length > 0 && <p className="text-center font-mono text-micro text-txt-3">{historyLabel}</p>}
          {entries.map((entry, index) => {
            const separator = chatSeparatorLabel(entry.at, entries[index - 1]?.at);
            return (
              <Fragment key={entry.id}>
                {separator && <DateSeparator label={separator} />}
                <ReadOnlyChatMessage entry={entry} agentId={agentId} actions={renderEntryActions?.(entry)} />
              </Fragment>
            );
          })}
        </div>
      </div>
      {newMessages && (
        <Button size="sm" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-pop" onClick={() => {
          following.current = true;
          anchor.current = null;
          setNewMessages(false);
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }}>↓ New messages</Button>
      )}
    </div>
  );
}
