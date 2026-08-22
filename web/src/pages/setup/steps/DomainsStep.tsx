import { useState } from 'react';
import type { SettingsFormApi } from '../../../lib/use-settings-form';

const textareaClass = 'w-full max-w-md rounded-lg border border-strong bg-bg-3 px-3 py-2 font-mono text-sm outline-none focus:border-accent';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-txt-3';

function parseDomains(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function DomainsStep({ api }: { api: SettingsFormApi }) {
  const [text, setText] = useState(() => api.form.allowed_domains.join('\n'));

  return (
    <div>
      <label className={labelClass}>Allowed domains (optional, one per line)</label>
      <textarea
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          api.update((prev) => ({ ...prev, allowed_domains: parseDomains(e.target.value) }));
        }}
        className={textareaClass}
        placeholder={'example.com\napi.example.com'}
      />
      <p className="mt-2 font-mono text-[11px] text-txt-3">
        Domains the assistant is allowed to reach with its curl/HTTP tool. Leave empty to deny all outbound requests.
      </p>
    </div>
  );
}
