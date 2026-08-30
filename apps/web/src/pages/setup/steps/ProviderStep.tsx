import { formatConnectionTestResult, type SettingsFormApi } from '../../../lib/use-settings-form';

const inputClass = 'w-full rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';
const buttonClass = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60';

function ProfileFields({
  api,
  role,
  disabled,
}: {
  api: SettingsFormApi;
  role: 'manager' | 'workers';
  disabled: boolean;
}) {
  const profile = api.form[role];
  const result = api.connectionResults[role];
  const testing = api.testingConnection[role];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Provider</label>
        <select
          disabled={disabled}
          value={profile.provider}
          onChange={(e) => api.update((prev) => ({ ...prev, [role]: { ...prev[role], provider: e.target.value } }))}
          className={inputClass}
        >
          {api.providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Base URL</label>
        <input
          disabled={disabled}
          value={profile.base_url}
          onChange={(e) => api.update((prev) => ({ ...prev, [role]: { ...prev[role], base_url: e.target.value } }))}
          className={`${inputClass} font-mono`}
          placeholder="leave blank to use the provider default"
        />
      </div>
      <div>
        <label className={labelClass}>Model</label>
        <input
          disabled={disabled}
          value={profile.model}
          onChange={(e) => api.update((prev) => ({ ...prev, [role]: { ...prev[role], model: e.target.value } }))}
          className={`${inputClass} font-mono`}
          placeholder="gemma4:e4b"
        />
      </div>
      <div>
        <label className={labelClass}>API token</label>
        <input
          disabled={disabled}
          type="password"
          value={profile.api_token}
          onChange={(e) => api.update((prev) => ({ ...prev, [role]: { ...prev[role], api_token: e.target.value } }))}
          className={`${inputClass} font-mono`}
          placeholder={
            (role === 'manager' ? api.original?.AI?.MANAGER?.API_TOKEN : api.original?.AI?.WORKERS?.API_TOKEN)?.includes('••••')
              ? 'Leave blank to keep current token'
              : 'Only required by some providers'
          }
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || testing}
          onClick={() => api.testProviderConnection(role)}
          className={buttonClass}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {result && (
          <span className={`font-mono text-[11px] ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
            {formatConnectionTestResult(result)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProviderStep({ api }: { api: SettingsFormApi }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium">Manager model</h3>
        <p className="mt-1 font-mono text-[11px] text-txt-3">Handles conversation and decides what to do.</p>
      </div>
      <ProfileFields api={api} role="manager" disabled={false} />

      <label className="flex items-center gap-2 pt-2 text-sm">
        <input
          type="checkbox"
          checked={api.form.sameForBoth}
          onChange={(e) => api.update((prev) => ({ ...prev, sameForBoth: e.target.checked }))}
        />
        Use the same provider for worker/background tasks
      </label>

      {!api.form.sameForBoth && (
        <>
          <div>
            <h3 className="text-sm font-medium">Worker model</h3>
            <p className="mt-1 font-mono text-[11px] text-txt-3">Handles background tasks like summarization.</p>
          </div>
          <ProfileFields api={api} role="workers" disabled={false} />
        </>
      )}
    </div>
  );
}
