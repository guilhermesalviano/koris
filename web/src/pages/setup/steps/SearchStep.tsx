import type { SettingsFormApi } from '../../../lib/use-settings-form';

const inputClass = 'w-full max-w-md rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';

export function SearchStep({ api }: { api: SettingsFormApi }) {
  return (
    <div>
      <label className={labelClass}>Web search API key (optional)</label>
      <input
        type="password"
        value={api.form.search_api_key}
        onChange={(e) => api.update((prev) => ({ ...prev, search_api_key: e.target.value }))}
        className={`${inputClass} font-mono`}
        placeholder={api.original?.AI?.SEARCH_API_KEY?.includes('••••') ? 'Leave blank to keep current key' : 'SerpAPI key'}
      />
      <p className="mt-2 font-mono text-[11px] text-txt-3">
        Enables the assistant&apos;s web search tool. Skip this if you don&apos;t need it.
      </p>
    </div>
  );
}
