import { useState } from 'react';
import type { SettingsFormApi } from '../../../lib/use-settings-form';
import { Toggle } from '../../../components/AdminUI';
import { usePlugins, type UsePluginsApi } from '../../../lib/use-plugins';
import { apiRequest } from '../../../lib/api';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const buttonClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';

export function ChannelsStep({
  api,
  pluginsApi: providedPluginsApi,
}: {
  api: SettingsFormApi;
  pluginsApi?: UsePluginsApi;
  onlyEnabled?: boolean;
}) {
  const { telegram, whatsapp } = api.form;
  const localPluginsApi = usePlugins();
  const pluginsApi = providedPluginsApi ?? localPluginsApi;

  const [downloading, setDownloading] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const telegramPlugin = pluginsApi.items.find((i) => i.family === 'channels' && i.name === 'telegram');
  const isTelegramInstalled = !!telegramPlugin;
  const isTelegramEnabled = telegramPlugin?.enabled ?? false;

  const whatsappPlugin = pluginsApi.items.find((i) => i.family === 'channels' && i.name === 'whatsapp');
  const isWhatsappInstalled = !!whatsappPlugin;
  const isWhatsappEnabled = whatsappPlugin?.enabled ?? false;

  async function handleDownloadChannel(slug: 'telegram' | 'whatsapp') {
    setDownloading(slug);
    setDownloadError(null);
    try {
      await apiRequest(`/marketplace/${slug}/pull`, { method: 'POST' });
      await apiRequest(`/plugins/channels/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      });
      await pluginsApi.reload();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : `Failed to download ${slug}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleToggleChannel(slug: 'telegram' | 'whatsapp', enabled: boolean) {
    setActivating(slug);
    setDownloadError(null);
    try {
      await apiRequest(`/plugins/channels/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      await pluginsApi.reload();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : `Failed to update ${slug}`);
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <p className="text-sm font-medium">Chat channels (optional)</p>
        <p className="mt-1 font-mono text-[11px] text-txt-3">
          Download and activate Telegram or WhatsApp to communicate with your agent via messaging apps, or click Next to proceed with Web & TUI only.
        </p>
      </div>

      {downloadError && (
        <div className="rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-2.5 text-xs text-red-300">
          {downloadError}
        </div>
      )}

      {/* Telegram Channel */}
      <div className="rounded-lg border border-subtle bg-bg-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Telegram</span>
            {!isTelegramInstalled ? (
              <span className="font-mono text-[10px] uppercase text-amber-400 border border-amber-400/30 rounded px-1.5 py-0.5">
                Not installed
              </span>
            ) : !isTelegramEnabled ? (
              <span className="font-mono text-[10px] uppercase text-txt-3 border border-subtle rounded px-1.5 py-0.5">
                Installed (Inactive)
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase text-emerald-400 border border-emerald-400/30 rounded px-1.5 py-0.5">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isTelegramInstalled ? (
              <button
                type="button"
                disabled={downloading === 'telegram'}
                onClick={() => handleDownloadChannel('telegram')}
                className={`${buttonClass} whitespace-nowrap`}
              >
                {downloading === 'telegram' ? 'Downloading…' : 'Download Telegram'}
              </button>
            ) : !isTelegramEnabled ? (
              <button
                type="button"
                disabled={activating === 'telegram'}
                onClick={() => handleToggleChannel('telegram', true)}
                className={`${buttonClass} whitespace-nowrap`}
              >
                {activating === 'telegram' ? 'Activating…' : 'Activate Telegram'}
              </button>
            ) : (
              <button
                type="button"
                disabled={activating === 'telegram'}
                onClick={() => handleToggleChannel('telegram', false)}
                className="rounded-lg border border-subtle bg-bg px-3 py-1.5 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 whitespace-nowrap"
              >
                {activating === 'telegram' ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          {!isTelegramInstalled ? (
            <p className="font-mono text-[11px] text-txt-3">
              Connect your agent to a Telegram bot with text, photos, and approvals. Click Download to install from Koris Hub.
            </p>
          ) : !isTelegramEnabled ? (
            <p className="font-mono text-[11px] text-txt-3">
              Telegram channel is installed locally. Click Activate above to enable it and configure your bot credentials.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Bot token</label>
                <input
                  type="password"
                  value={telegram.bot_token}
                  onChange={(e) => api.update((prev) => ({ ...prev, telegram: { ...prev.telegram, bot_token: e.target.value } }))}
                  className={`${inputClass} font-mono`}
                  placeholder={api.original?.CHANNELS?.TELEGRAM?.BOT_TOKEN?.includes('••••') ? 'Leave blank to keep current token' : '123456789:AA...'}
                />
              </div>
              <div>
                <label className={labelClass}>Whitelist (comma-separated chat IDs)</label>
                <input
                  value={telegram.whitelist}
                  onChange={(e) => api.update((prev) => ({ ...prev, telegram: { ...prev.telegram, whitelist: e.target.value } }))}
                  className={`${inputClass} font-mono`}
                  placeholder="123456,789012"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  disabled={api.testingTelegram || !telegram.bot_token}
                  onClick={() => api.testTelegramToken()}
                  className={`${buttonClass} w-full sm:w-auto`}
                >
                  {api.testingTelegram ? 'Testing…' : 'Test token'}
                </button>
                {api.telegramTestResult && (
                  <span className={`font-mono text-[11px] break-words min-w-0 ${api.telegramTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {api.telegramTestResult.ok ? `valid — @${api.telegramTestResult.username ?? '?'}` : (api.telegramTestResult.error ?? 'invalid token')}
                  </span>
                )}
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">Allow unlisted senders</div>
                  <div className="font-mono text-[11px] text-txt-3">
                    Reply to senders not on the whitelist, as untrusted (no tools or learned skills).
                  </div>
                </div>
                <Toggle
                  checked={telegram.allow_unlisted_senders}
                  onChange={() => api.update((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, allow_unlisted_senders: !prev.telegram.allow_unlisted_senders },
                  }))}
                  label="Allow unlisted senders on Telegram"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Channel */}
      <div className="rounded-lg border border-subtle bg-bg-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">WhatsApp</span>
            {!isWhatsappInstalled ? (
              <span className="font-mono text-[10px] uppercase text-amber-400 border border-amber-400/30 rounded px-1.5 py-0.5">
                Not installed
              </span>
            ) : !isWhatsappEnabled ? (
              <span className="font-mono text-[10px] uppercase text-txt-3 border border-subtle rounded px-1.5 py-0.5">
                Installed (Inactive)
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase text-emerald-400 border border-emerald-400/30 rounded px-1.5 py-0.5">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isWhatsappInstalled ? (
              <button
                type="button"
                disabled={downloading === 'whatsapp'}
                onClick={() => handleDownloadChannel('whatsapp')}
                className={`${buttonClass} whitespace-nowrap`}
              >
                {downloading === 'whatsapp' ? 'Downloading…' : 'Download WhatsApp'}
              </button>
            ) : !isWhatsappEnabled ? (
              <button
                type="button"
                disabled={activating === 'whatsapp'}
                onClick={() => handleToggleChannel('whatsapp', true)}
                className={`${buttonClass} whitespace-nowrap`}
              >
                {activating === 'whatsapp' ? 'Activating…' : 'Activate WhatsApp'}
              </button>
            ) : (
              <button
                type="button"
                disabled={activating === 'whatsapp'}
                onClick={() => handleToggleChannel('whatsapp', false)}
                className="rounded-lg border border-subtle bg-bg px-3 py-1.5 font-mono text-[11px] text-txt-3 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 whitespace-nowrap"
              >
                {activating === 'whatsapp' ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          {!isWhatsappInstalled ? (
            <p className="font-mono text-[11px] text-txt-3">
              Connect your agent to WhatsApp via Baileys with QR code pairing. Click Download to install from Koris Hub.
            </p>
          ) : !isWhatsappEnabled ? (
            <p className="font-mono text-[11px] text-txt-3">
              WhatsApp channel is installed locally. Click Activate above to enable it and pair your device.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Bot number (for group mentions)</label>
                  <input
                    value={whatsapp.bot_number}
                    onChange={(e) => api.update((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, bot_number: e.target.value } }))}
                    className={`${inputClass} font-mono`}
                    placeholder="5511999998888"
                  />
                  <p className="mt-1 font-mono text-[11px] text-txt-3">
                    Digits only. Leave blank to auto-detect it from the linked WhatsApp session.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Whitelist (comma-separated numbers)</label>
                  <input
                    value={whatsapp.whitelist}
                    onChange={(e) => api.update((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, whitelist: e.target.value } }))}
                    className={`${inputClass} font-mono`}
                    placeholder="5511999999999"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  disabled={api.whatsappConnecting}
                  onClick={() => api.connectWhatsApp()}
                  className={`${buttonClass} w-full sm:w-auto`}
                >
                  {api.whatsappConnecting ? 'Connecting…' : 'Connect'}
                </button>
                {api.whatsappConnectResult && (
                  <span className="font-mono text-[11px] break-words min-w-0 text-txt-3">{api.whatsappConnectResult}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">Allow unlisted senders</div>
                  <div className="font-mono text-[11px] text-txt-3">
                    Reply to senders not on the whitelist, as untrusted (no tools or learned skills).
                  </div>
                </div>
                <Toggle
                  checked={whatsapp.allow_unlisted_senders}
                  onChange={() => api.update((prev) => ({
                    ...prev,
                    whatsapp: { ...prev.whatsapp, allow_unlisted_senders: !prev.whatsapp.allow_unlisted_senders },
                  }))}
                  label="Allow unlisted senders on WhatsApp"
                />
              </div>
              <p className="font-mono text-[11px] text-txt-3">
                WhatsApp pairing uses a QR code. Check the server&apos;s terminal output for a QR code to
                scan with WhatsApp on your phone.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
