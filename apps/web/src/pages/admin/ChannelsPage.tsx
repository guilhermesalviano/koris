import { useCallback, useEffect, useState } from 'react';
import { PageShell, Card, EmptyState, formatDate, useToast, Toast } from '../../components/AdminUI';
import { apiRequest } from '../../lib/api';
import { useSettingsForm, buildChannelsPatch } from '../../lib/use-settings-form';
import { ChannelsStep } from '../setup/steps/ChannelsStep';
import type { ChannelsResponse, OutboundResponse } from '../../lib/types';

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-wider text-txt-3 first:mt-0">{children}</h2>;
}

export default function ChannelsPage() {
  const settings = useSettingsForm();
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outbound, setOutbound] = useState<OutboundResponse | null>(null);
  const [outboundError, setOutboundError] = useState<string | null>(null);
  const [channel, setChannel] = useState('');
  const [target, setTarget] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [toastMsg, showToast, isError] = useToast();

  async function saveChannelSettings() {
    const ok = await settings.submit(buildChannelsPatch(settings.form));
    showToast(ok ? 'Channel settings saved' : (settings.saveErrors?.[0] ?? 'Failed to save'), !ok);
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiRequest<ChannelsResponse>('/channels'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    }
  }, []);

  const loadOutbound = useCallback(async () => {
    setOutboundError(null);
    try {
      setOutbound(await apiRequest<OutboundResponse>('/outbound'));
    } catch (err) {
      setOutboundError(err instanceof Error ? err.message : 'Failed to load outbound messages');
    }
  }, []);

  useEffect(() => {
    load();
    loadOutbound();
  }, [load, loadOutbound]);

  async function setPrincipal(id: string) {
    try {
      await apiRequest(`/channels/${id}/principal`, { method: 'PATCH' });
      showToast('Principal channel updated');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', true);
    }
  }

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
      loadOutbound();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed', true);
    } finally {
      setSending(false);
    }
  }

  const principal = data?.items.find((c) => c.isPrincipal);

  return (
    <PageShell
      title="Channels"
      description="Connected messaging channels and outbound messages"
      onRefresh={() => {
        load();
        loadOutbound();
        settings.reload();
      }}
    >
      <SectionTitle>Channel configuration</SectionTitle>
      {settings.loadError && <EmptyState text={settings.loadError} />}
      {settings.loading && !settings.loadError && <EmptyState text="Loading…" />}
      {!settings.loading && !settings.loadError && (
        <Card>
          <ChannelsStep api={settings} />
          {settings.saveErrors && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-3 text-sm text-red-300">
              {settings.saveErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <button
            type="button"
            disabled={settings.saving}
            onClick={saveChannelSettings}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {settings.saving ? 'Saving…' : 'Save channel settings'}
          </button>
        </Card>
      )}

      <SectionTitle>Recorded channels</SectionTitle>
      {error && <EmptyState text={error} />}
      {!error && !data && <EmptyState text="Loading…" />}
      {!error && data && (
        <>
          {data.items.length === 0 && (
            <Card>
              <EmptyState text="No channels recorded yet. The first message sent via Telegram or WhatsApp sets the principal channel." />
            </Card>
          )}
          {data.items.length > 0 && (
            <Card>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">
                Recorded channels ({data.items.length})
              </div>
              {data.items.map((c) => (
                <div
                  key={c.id}
                  className={`mb-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    c.isPrincipal ? 'border-accent-muted bg-accent-muted' : 'border-subtle bg-bg-3'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-accent-2">{c.channel}</span>
                      {c.isPrincipal && (
                        <span className="rounded-full border border-accent-muted bg-accent-muted px-2 py-0.5 font-mono text-[10px] text-accent-2">
                          principal
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-txt-2">{c.target}</div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <div className="font-mono text-[10px] text-txt-3">{formatDate(c.createdAt)}</div>
                    {!c.isPrincipal && (
                      <button
                        onClick={() => setPrincipal(c.id)}
                        className="rounded-md border border-subtle px-2 py-0.5 font-mono text-[10px] text-txt-3 hover:border-accent hover:text-accent-2"
                      >
                        Set principal
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
          {principal && (
            <div className="mt-3">
              <Card>
                <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">Principal channel</div>
                <p className="mt-1 text-sm text-txt-2">
                  Heartbeat results are delivered to{' '}
                  <span className="font-mono text-accent-2">
                    {principal.channel} · {principal.target}
                  </span>{' '}
                  unless a beat specifies its own channel and target.
                </p>
              </Card>
            </div>
          )}
        </>
      )}

      <SectionTitle>Outbound messages</SectionTitle>
      <Card>
        <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-txt-3">Start a message</div>
        <form onSubmit={sendMessage} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent sm:w-44"
            >
              <option value="">channel</option>
              {settings.channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="chat id / jid"
              className="w-full flex-1 rounded-lg border border-strong bg-bg-3 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
          </div>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Message content"
            rows={2}
            className="w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className="mt-2 font-mono text-[10px] text-txt-3">
          Provide a channel and the recipient target (Telegram chat id or WhatsApp JID).
        </p>
      </Card>

      <div className="mt-4">
        {outboundError && <EmptyState text={outboundError} />}
        {!outboundError && !outbound && <EmptyState text="Loading…" />}
        {!outboundError && outbound && outbound.items.length === 0 && (
          <Card>
            <EmptyState text="No outbound messages yet." />
          </Card>
        )}
        {!outboundError && outbound && outbound.items.length > 0 && (
          <Card>
            {outbound.items.map((m) => (
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
