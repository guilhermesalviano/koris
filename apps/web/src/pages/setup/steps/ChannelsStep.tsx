import type { SettingsFormApi } from '../../../lib/use-settings-form';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const buttonClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';

export function ChannelsStep({ api }: { api: SettingsFormApi }) {
  const { telegram, whatsapp } = api.form;

  return (
    <div className="space-y-8">
      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={telegram.enabled}
            onChange={(e) => api.update((prev) => ({ ...prev, telegram: { ...prev.telegram, enabled: e.target.checked } }))}
          />
          Enable Telegram
        </label>

        {telegram.enabled && (
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
          </div>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={whatsapp.enabled}
            onChange={(e) => api.update((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, enabled: e.target.checked } }))}
          />
          Enable WhatsApp
        </label>

        {whatsapp.enabled && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Mention ID (for group chats)</label>
                <input
                  value={whatsapp.mention_id}
                  onChange={(e) => api.update((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, mention_id: e.target.value } }))}
                  className={inputClass}
                />
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
            <p className="font-mono text-[11px] text-txt-3">
              WhatsApp pairing uses a QR code. Save your settings first so WhatsApp is enabled, then check the
              server&apos;s terminal output for a QR code to scan with WhatsApp on your phone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
