import type { SettingsFormApi } from '../../../lib/use-settings-form';
import type { UsePluginsApi } from '../../../lib/use-plugins';

const rowClass = 'flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-4 border-b border-subtle py-2 sm:py-1.5 text-sm last:border-0';

export function ReviewStep({ api, pluginsApi }: { api: SettingsFormApi; pluginsApi?: UsePluginsApi }) {
  const { form } = api;
  const workers = form.sameForBoth ? form.manager : form.workers;

  const isTelegramEnabled = pluginsApi
    ? pluginsApi.items.find((i) => i.family === 'channels' && i.name === 'telegram')?.enabled ?? false
    : !!api.original?.CHANNELS?.TELEGRAM?.ENABLED;

  const isWhatsappEnabled = pluginsApi
    ? pluginsApi.items.find((i) => i.family === 'channels' && i.name === 'whatsapp')?.enabled ?? false
    : !!api.original?.CHANNELS?.WHATSAPP?.ENABLED;

  return (
    <div>
      <div className="rounded-lg border border-subtle bg-bg-3 px-3.5 py-3 sm:px-4">
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Manager provider</span>
          <span className="break-all font-mono text-xs text-txt sm:break-normal sm:text-right sm:text-sm">{form.manager.provider} · {form.manager.model || '—'}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Worker provider</span>
          <span className="break-all font-mono text-xs text-txt sm:break-normal sm:text-right sm:text-sm">{workers.provider} · {workers.model || '—'}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Telegram</span>
          <span className="text-xs text-txt sm:text-sm">{isTelegramEnabled ? 'enabled' : 'disabled'}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">WhatsApp</span>
          <span className="text-xs text-txt sm:text-sm">{isWhatsappEnabled ? 'enabled' : 'disabled'}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Allowed domains</span>
          <span className="text-xs text-txt sm:text-sm">{form.allowed_domains.length || 'none'}</span>
        </div>
        <div className={rowClass}>
          <span className="text-xs text-txt-3 sm:text-sm">Personal info fields</span>
          <span className="text-xs text-txt sm:text-sm">{Object.keys(form.personal_information).length || 'none'}</span>
        </div>
      </div>

      {api.saveErrors && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-3 text-sm text-red-300">
          {api.saveErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
