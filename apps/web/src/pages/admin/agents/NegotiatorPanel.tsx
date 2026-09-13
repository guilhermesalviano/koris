import { useMemo, useState } from 'react';
import { Toast, useToast } from '../../../components/AdminUI';
import { ReadOnlyAgentChat } from '../../../components/chat/ReadOnlyAgentChat';
import { Button, Input } from '../../../components/ui';
import { apiRequest } from '../../../lib/api';
import { buildNegotiatorChat, loadNegotiatorChat } from '../../../lib/subagent-chat';
import { useReadOnlyData } from '../../../lib/use-read-only-data';
import type { ErrandItem, ErrandState } from '../../../lib/types';

type ErrandAction = 'approve' | 'cancel' | 'close' | 'retry';

const CLOSED_STATES: ErrandState[] = ['resolved', 'failed', 'cancelled', 'expired'];

const DONE_MESSAGE: Record<ErrandAction, string> = {
  approve: 'Errand approved',
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
  const canAnswer = errand.state === 'awaiting_principal' && !errand.delivery;
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
        {canAnswer && (
          <Button size="sm" variant="subtle" disabled={busy} aria-expanded={answering} onClick={() => { setAnswering(!answering); setAnswer(''); }}>
            {answering ? 'Close Reply' : 'Answer'}
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
            placeholder="e.g. Yes, confirm for Saturday at 10am…"
            className="h-8 min-w-0 flex-1 text-caption"
          />
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!answer.trim()}>Send Answer</Button>
        </form>
      )}
    </div>
  );
}

export default function NegotiatorPanel() {
  const { data, loading, error, refresh } = useReadOnlyData(loadNegotiatorChat);
  const entries = useMemo(() => buildNegotiatorChat(data ?? []), [data]);
  const errands = useMemo(() => new Map((data ?? []).map(({ errand }) => [`errand:${errand.id}`, errand])), [data]);
  const [toastMsg, showToast, isError] = useToast();

  return (
    <>
      <ReadOnlyAgentChat
        agentId="negotiator"
        title="Negotiator"
        entries={entries}
        loading={loading}
        loaded={data !== null}
        error={error}
        onRefresh={() => void refresh()}
        emptyText="No errands yet. Start an errand from the Orchestrator to see its conversation here."
        historyLabel="Available conversations from the latest 50 errands · up to 100 messages per contact"
        renderEntryActions={(entry) => {
          const errand = errands.get(entry.id);
          return errand && <ErrandActions key={errand.id} errand={errand} notify={showToast} onChanged={() => void refresh()} />;
        }}
      />
      <Toast message={toastMsg} isError={isError} />
    </>
  );
}
