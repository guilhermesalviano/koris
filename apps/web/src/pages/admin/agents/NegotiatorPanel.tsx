import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Toast, useToast } from '../../../components/AdminUI';
import ImageLightbox from '../../../components/ImageLightbox';
import { imageSrc } from '../../../components/chat/shared';
import { DateSeparator } from '../../../components/chat/DateSeparator';
import { ReadOnlyAgentChat, ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { Button, Input, Select } from '../../../components/ui';
import { apiRequest } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { chatSeparatorLabel, dayTimeLabel } from '../../../lib/date';
import { buildNegotiationCenter, buildNegotiatorChat, headerErrand, loadNegotiatorNotices, negotiationSteps, type ReadOnlyChatEntry } from '../../../lib/subagent-chat';
import { isNearBottom } from '../../../lib/timeline';
import { useAgentActivity } from '../../../lib/agent-activity-context';
import { useReadOnlyData } from '../../../lib/use-read-only-data';
import type { ErrandItem, ErrandState, ImageAttachment, NegotiatorPendingQuestion } from '../../../lib/types';

type ErrandAction = 'approve' | 'cancel' | 'close' | 'confirm' | 'retry';

const CLOSED_STATES: ErrandState[] = ['resolved', 'failed', 'cancelled', 'expired'];

const DONE_MESSAGE: Record<ErrandAction, string> = {
  approve: 'Errand approved',
  confirm: 'Closing message sent, errand resolved',
  retry: 'Errand message delivered',
  cancel: 'Errand cancelled',
  close: 'Errand closed',
};

interface ErrandActionsProps {
  errand: Pick<ErrandItem, 'id' | 'state' | 'delivery'>;
  onChanged: () => void;
  notify: (message: string, isError?: boolean) => void;
  /** Starts with the answer form open; lets tests render it without interaction. */
  initialAnswering?: boolean;
}

/** Steering controls for one errand: approve the opener, answer an escalation, retry delivery, close or cancel. */
export function ErrandActions({ errand, onChanged, notify, initialAnswering = false }: ErrandActionsProps) {
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState(initialAnswering);
  const [answer, setAnswer] = useState('');
  const confirming = errand.state === 'awaiting_confirmation';
  const canAnswer = (errand.state === 'awaiting_principal' || confirming) && !errand.delivery;
  const open = !CLOSED_STATES.includes(errand.state);

  async function run(request: () => Promise<unknown>, done: string, failed: string) {
    setBusy(true);
    try {
      await request();
      notify(done);
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : failed, true);
      return false;
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const act = (action: ErrandAction) => run(
    () => apiRequest(`/errands/${encodeURIComponent(errand.id)}/${action}`, { method: 'POST' }),
    DONE_MESSAGE[action],
    `Failed to ${action} errand`,
  );

  async function submitAnswer() {
    const text = answer.trim();
    if (!text || busy) return;
    const sent = await run(
      () => apiRequest(`/errands/${encodeURIComponent(errand.id)}/reply`, { method: 'POST', body: JSON.stringify({ answer: text }) }),
      'Answer sent to contact, errand resumed',
      'Failed to send answer',
    );
    if (sent) {
      setAnswering(false);
      setAnswer('');
    }
  }

  if (!open && !errand.delivery) return null;

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-wrap gap-2">
        {errand.delivery && <Button size="sm" variant="danger" disabled={busy} onClick={() => void act('retry')}>Retry Send</Button>}
        {errand.state === 'draft' && !errand.delivery && <Button size="sm" variant="subtle" disabled={busy} onClick={() => void act('approve')}>Approve</Button>}
        {confirming && !errand.delivery && <Button size="sm" variant="primary" disabled={busy} onClick={() => void act('confirm')}>Resolve</Button>}
        {canAnswer && (
          <Button size="sm" variant="subtle" disabled={busy} aria-expanded={answering} onClick={() => { setAnswering(!answering); setAnswer(''); }}>
            {answering ? 'Close Reply' : confirming ? 'Add requirement' : 'Answer'}
          </Button>
        )}
        {open && (
          <>
            <Button size="sm" disabled={busy} onClick={() => void act('close')}>Close</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('cancel')}>Cancel</Button>
          </>
        )}
      </div>
      {canAnswer && answering && (
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submitAnswer(); }}>
          <Input
            aria-label="Answer to send to the contact"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={confirming ? 'e.g. Also ask for a juice…' : 'e.g. Yes, confirm for Saturday at 10am…'}
            className="h-8 min-w-0 flex-1 text-caption"
          />
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!answer.trim()}>Send Answer</Button>
        </form>
      )}
    </div>
  );
}

/** Header of the history aside: the followed errand's goal and where its negotiation stands, left to right. */
export function NegotiationStepsHeader({ errand }: { errand: Pick<ErrandItem, 'goal' | 'state'> }) {
  const steps = negotiationSteps(errand.state);
  return (
    <header className="flex-shrink-0 border-b border-subtle px-4 py-3">
      <p className="truncate text-caption font-medium text-txt" title={errand.goal}>{errand.goal}</p>
      <ol aria-label="Negotiation steps" className="mt-2.5 flex items-center">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={step.status === 'current' ? 'step' : undefined} className={cn('flex min-w-0 items-center', index > 0 && 'flex-1')}>
            {index > 0 && <span aria-hidden className={cn('mx-2 h-px min-w-3 flex-1', step.status === 'upcoming' ? 'bg-bg-4' : 'bg-accent')} />}
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className={cn(
                'h-2 w-2 flex-shrink-0 rounded-full border',
                step.status === 'upcoming' && 'border-strong bg-transparent',
                step.status === 'current' && 'border-accent bg-accent ring-2 ring-accent-muted',
                step.status === 'done' && (step.unsuccessful ? 'border-danger bg-danger' : 'border-accent bg-accent'),
              )} />
              <span className={cn(
                'text-micro',
                step.status === 'upcoming' ? 'text-txt-3' : step.unsuccessful ? 'text-danger' : 'text-txt',
                step.status === 'current' && 'font-medium',
              )}>{step.label}</span>
            </span>
          </li>
        ))}
      </ol>
    </header>
  );
}

interface NegotiationCenterProps {
  entries: readonly ReadOnlyChatEntry[];
  /** Questions waiting on the principal, newest first. */
  pending: readonly NegotiatorPendingQuestion[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  notify: (message: string, isError?: boolean) => void;
  onAnswered: () => void;
}

/** Main area of the Negotiator page: every negotiation's notices as one history, plus a composer that answers a pending question. */
export function NegotiationCenter({ entries, pending, loading, loaded, error, notify, onAnswered }: NegotiationCenterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const target = pending.find((question) => question.errandId === chosenId) ?? pending[0] ?? null;
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [entries]);

  const confirming = target?.kind === 'confirmation';

  async function send(request: () => Promise<unknown>, done: string, failed: string) {
    setSending(true);
    try {
      await request();
      following.current = true;
      notify(done);
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : failed, true);
      return false;
    } finally {
      setSending(false);
      onAnswered();
    }
  }

  async function submit() {
    const text = answer.trim();
    if (!target || !text || sending) return;
    const sent = await send(
      () => apiRequest(`/errands/${encodeURIComponent(target.errandId)}/reply`, { method: 'POST', body: JSON.stringify({ answer: text }) }),
      confirming ? 'Requirement sent to contact, errand resumed' : 'Answer sent to contact, errand resumed',
      'Failed to send answer',
    );
    if (sent) setAnswer('');
  }

  function resolve() {
    if (!target || sending) return;
    void send(
      () => apiRequest(`/errands/${encodeURIComponent(target.errandId)}/confirm`, { method: 'POST' }),
      'Closing message sent, errand resolved',
      'Failed to resolve errand',
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={(event) => { following.current = isNearBottom(event.currentTarget); }}
        aria-label="Negotiation center"
        aria-busy={loading}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-5"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {error && <p role="alert" className="text-center text-caption text-danger">{error}</p>}
          {!loaded && loading && <p role="status" className="py-12 text-center text-caption text-txt-3">Loading negotiations…</p>}
          {loaded && entries.length === 0 && (
            <p className="py-12 text-center text-body text-txt-3">No negotiation updates yet. Questions and results from the Negotiator appear here.</p>
          )}
          {entries.map((entry, index) => {
            const separator = entry.section
              ? `${entry.section} · ${dayTimeLabel(entry.sectionAt ?? entry.at)}`
              : chatSeparatorLabel(entry.at, entries[index - 1]?.at);
            return (
              <Fragment key={entry.id}>
                {separator && <DateSeparator label={separator} session={Boolean(entry.section)} />}
                <ReadOnlyChatMessage entry={entry} agentId="negotiator" />
              </Fragment>
            );
          })}
        </div>
      </div>
      <form
        className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-subtle px-4 py-3"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        {pending.length > 1 && (
          <Select
            aria-label="Question to answer"
            value={target?.errandId ?? ''}
            onChange={(event) => setChosenId(event.target.value)}
            className="h-9 w-full sm:w-56"
          >
            {pending.map((question) => <option key={question.errandId} value={question.errandId}>{question.goal}</option>)}
          </Select>
        )}
        <Input
          aria-label="Answer to the Negotiator"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={!target}
          placeholder={!target ? 'No question is waiting for your answer'
            : confirming ? 'Add a requirement…' : `Answer: ${target.question ?? target.goal}`}
          className="min-w-0 flex-1"
        />
        {confirming && <Button type="button" variant="primary" disabled={sending} onClick={resolve}>Resolve</Button>}
        <Button type="submit" variant={confirming ? 'subtle' : 'primary'} loading={sending} disabled={!target || !answer.trim()}>Send</Button>
      </form>
    </>
  );
}

const NOTICES_POLL_MS = 4_000;

export default function NegotiatorPanel() {
  const { negotiator: { data, loading, error, refresh } } = useAgentActivity();
  const entries = useMemo(() => buildNegotiatorChat(data ?? []), [data]);
  const errands = useMemo(() => new Map((data ?? []).map(({ errand }) => [`errand:${errand.id}`, errand])), [data]);
  const followed = useMemo(() => headerErrand([...errands.values()]), [errands]);
  const [toastMsg, showToast, isError] = useToast();
  const [preview, setPreview] = useState<{ images: ImageAttachment[]; index: number } | null>(null);
  const cyclePreview = (step: number) => setPreview((current) => current && {
    ...current, index: (current.index + step + current.images.length) % current.images.length,
  });
  const notices = useReadOnlyData(loadNegotiatorNotices);
  const centerEntries = useMemo(() => buildNegotiationCenter(notices.data?.notices ?? [], [...errands.values()]), [notices.data, errands]);

  // The notices request is cheap and carries the pending questions plus a
  // fingerprint of the errand list, so it is polled often while the page is
  // visible; the errand list follows as soon as that fingerprint changes.
  const refreshNotices = notices.refresh;
  const noticesLoading = notices.loading;
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden && !noticesLoading) void refreshNotices();
    }, NOTICES_POLL_MS);
    return () => window.clearInterval(interval);
  }, [noticesLoading, refreshNotices]);

  // Polling pauses in a hidden tab; catch up as soon as it is visible again.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refreshNotices();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshNotices]);

  const noticesVersion = notices.data && JSON.stringify([
    notices.data.errandsVersion,
    notices.data.notices.length, notices.data.notices[notices.data.notices.length - 1]?.id ?? null,
    notices.data.pending.map((question) => [question.errandId, question.askedAt]),
  ]);
  const seenVersion = useRef<string | null>(null);
  useEffect(() => {
    if (!noticesVersion) return;
    if (seenVersion.current !== null && seenVersion.current !== noticesVersion) void refresh();
    seenVersion.current = noticesVersion;
  }, [noticesVersion, refresh]);

  const refreshAll = () => {
    void refresh();
    void notices.refresh();
  };

  return (
    <>
      <ReadOnlyAgentChat
        agentId="negotiator"
        title="Negotiator"
        entries={entries}
        loading={loading}
        loaded={data !== null}
        error={error}
        onRefresh={refreshAll}
        main={(
          <NegotiationCenter
            entries={centerEntries}
            pending={notices.data?.pending ?? []}
            loading={notices.loading}
            loaded={notices.data !== null}
            error={notices.error}
            notify={showToast}
            onAnswered={refreshAll}
          />
        )}
        emptyText="No errands yet. Start an errand from the Orchestrator to see its conversation here."
        historyLabel="Available conversations from the latest 50 errands · up to 100 messages per contact"
        historyAside
        onPreviewImages={(images, index) => setPreview({ images, index })}
        asideHeader={followed && <NegotiationStepsHeader errand={followed} />}
        renderEntryActions={(entry) => {
          const errand = errands.get(entry.id);
          return errand && <ErrandActions key={errand.id} errand={errand} notify={showToast} onChanged={() => void refresh()} />;
        }}
      />
      <ImageLightbox
        src={preview ? imageSrc(preview.images[preview.index]) : null}
        caption={preview && preview.images.length > 1 ? `Image ${preview.index + 1} of ${preview.images.length}` : undefined}
        onClose={() => setPreview(null)}
        onPrev={preview && preview.images.length > 1 ? () => cyclePreview(-1) : undefined}
        onNext={preview && preview.images.length > 1 ? () => cyclePreview(1) : undefined}
      />
      <Toast message={toastMsg} isError={isError} />
    </>
  );
}
