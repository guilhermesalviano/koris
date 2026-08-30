import type { SettingsFormApi } from '../../../lib/use-settings-form';

const rowClass = 'flex justify-between gap-4 border-b border-subtle py-1.5 text-sm last:border-0';

export function ReviewStep({ api }: { api: SettingsFormApi }) {
  const { form } = api;
  const workers = form.sameForBoth ? form.manager : form.workers;

  return (
    <div>
      <div className="rounded-lg border border-subtle bg-bg-3 px-4 py-3">
        <div className={rowClass}><span className="text-txt-3">Manager provider</span><span className="font-mono">{form.manager.provider} · {form.manager.model || '—'}</span></div>
        <div className={rowClass}><span className="text-txt-3">Worker provider</span><span className="font-mono">{workers.provider} · {workers.model || '—'}</span></div>
        <div className={rowClass}><span className="text-txt-3">Web search</span><span>{form.search_api_key ? 'key provided' : 'not set'}</span></div>
        <div className={rowClass}><span className="text-txt-3">Telegram</span><span>{api.original?.CHANNELS?.TELEGRAM?.ENABLED ? 'enabled' : 'disabled'}</span></div>
        <div className={rowClass}><span className="text-txt-3">WhatsApp</span><span>{api.original?.CHANNELS?.WHATSAPP?.ENABLED ? 'enabled' : 'disabled'}</span></div>
        <div className={rowClass}><span className="text-txt-3">Allowed domains</span><span>{form.allowed_domains.length || 'none'}</span></div>
        <div className={rowClass}><span className="text-txt-3">Personal info fields</span><span>{Object.keys(form.personal_information).length || 'none'}</span></div>
      </div>

      {api.saveErrors && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-[#2a1212] px-4 py-3 text-sm text-red-300">
          {api.saveErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
