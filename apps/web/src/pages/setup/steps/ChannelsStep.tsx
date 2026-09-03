import type { SettingsFormApi } from '../../../lib/use-settings-form';
import { Toggle } from '../../../components/AdminUI';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const buttonClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';

function EnabledIndicator({ enabled }: { enabled: boolean }) {
  return (
    <span className="font-mono text-[11px] text-txt-3">
      currently{' '}
      <span className={enabled ? 'text-green-400' : 'text-amber-400'}>{enabled ? 'enabled' : 'disabled'}</span>
      {' — '}toggle via Plugins
    </span>
  );
}

export function ChannelsStep({ api }: { api: SettingsFormApi }) {
  const { telegram, whatsapp } = api.form;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Telegram</span>
          <EnabledIndicator enabled={!!api.original?.CHANNELS?.TELEGRAM?.ENABLED} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="button"
              disabled={api.testingTelegram || !telegram.bot_token}
              onClick={() => api.testTelegramToken()}
              className={buttonClass}
            >
              {api.testingTelegram ? 'Testing…' : 'Test token'}
            </button>
            {api.telegramTestResult && (
              <span className={`font-mono text-[11px] ${api.telegramTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {api.telegramTestResult.ok ? `valid — @${api.telegramTestResult.username ?? '?'}` : (api.telegramTestResult.error ?? 'invalid token')}
              </span>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <div>
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
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">WhatsApp</span>
          <EnabledIndicator enabled={!!api.original?.CHANNELS?.WHATSAPP?.ENABLED} />
        </div>

        <div className="mt-3 space-y-3">
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={api.whatsappConnecting}
              onClick={() => api.connectWhatsApp()}
              className={buttonClass}
            >
              {api.whatsappConnecting ? 'Connecting…' : 'Connect'}
            </button>
            {api.whatsappConnectResult && (
              <span className="font-mono text-[11px] text-txt-3">{api.whatsappConnectResult}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
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
            WhatsApp pairing uses a QR code. Enable WhatsApp via Plugins first, then check the
            server&apos;s terminal output for a QR code to scan with WhatsApp on your phone.
          </p>
        </div>
      </div>
    </div>
  );
}
