import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import type { OutboundResponse } from '../../lib/types';

export default function OutboundPage() {
  const [data, setData] = useState<OutboundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<'telegram' | 'whatsapp' | ''>('');
  const [target, setTarget] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [toastMsg, showToast, isError] = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest<OutboundResponse>('/outbound');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outbound messages');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await apiRequest('/outbound', {
        method: 'POST',
        body: JSON.stringify({
          content,
          channel: channel || undefined,
          target: target || undefined,
        }),
      });
      showToast('Message sent');
      setChannel('');
      setTarget('');
      setContent('');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', true);
    } finally {
      setSending(false);
    }
  }

  return (
    <PageShell title="Outbound" description="Messages the agent has started with someone" onRefresh={load}>
      <Card>
        <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Start a message</div>
        <form onSubmit={sendMessage} className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'telegram' | 'whatsapp' | '')}
              className="w-1/3 rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">channel</option>
              <option value="telegram">telegram</option>
              <option value="whatsapp">whatsapp</option>
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="chat id / jid"
              className="flex-1 rounded-lg border border-strong bg-bg-3 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Message content"
            rows={2}
            className="rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className="mt-2 font-mono text-[10px] text-txt-3">
          Provide a channel and the recipient target (Telegram chat id or WhatsApp JID).
        </p>
      </Card>

      <div className="mt-4">
        {error && <EmptyState text={error} />}
        {!error && !data && <EmptyState text="Loading…" />}
        {!error && data && data.items.length === 0 && <Card><EmptyState text="No outbound messages yet." /></Card>}
        {!error && data && data.items.length > 0 && (
          <Card>
            {data.items.map((m) => (
              <div key={m.id} className="mb-2 rounded-lg border border-subtle bg-bg-3 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-txt-3">
                      <span className={m.status === 'sent' ? 'text-green-400' : 'text-red-400'}>{m.status}</span>
                      <span className="text-accent-2">{m.channel}</span>
                      <span className="text-txt-2">{m.target}</span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
                    {m.status === 'failed' && m.errorMessage && (
                      <div className="mt-1 font-mono text-[11px] text-red-400">{m.errorMessage}</div>
                    )}
                    <div className="mt-2 font-mono text-[10px] text-txt-3">
                      Created: {formatDate(m.createdAt)}
                      {m.sentAt ? ` · Sent: ${formatDate(m.sentAt)}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
      <Toast message={toastMsg} isError={isError} />
    </PageShell>
  );
}