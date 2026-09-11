import type { ReactNode } from 'react';
import type { SaveState } from '../lib/save-coordinator';

export const settingsInput = 'w-full rounded-xl border border-strong bg-bg-3/60 px-3 py-2.5 text-[13px] text-txt outline-none transition-colors placeholder:text-txt-3 focus:border-accent focus:ring-2 focus:ring-accent/15';
export const settingsButton = 'rounded-lg border border-strong bg-bg-3 px-3 py-2 text-xs font-medium text-txt-2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50';

export function SettingsSection({ title, description, children, onRefresh }: { title: string; description?: string; children: ReactNode; onRefresh?: () => void }) {
  return (
    <>
      <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-subtle px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-txt-2">{description}</p>}
        </div>
        {onRefresh && <button type="button" className={settingsButton} onClick={onRefresh}>Refresh</button>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">{children}</div>
    </>
  );
}

export function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-subtle bg-bg-2 p-4 sm:p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-txt-2">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SaveStatus({ state, error, retry }: { state: SaveState; error: string | null; retry: () => void }) {
  const failed = state === 'error' || state === 'invalid';
  return (
    <div aria-live="polite" className={`mt-2 flex min-h-4 flex-wrap items-center gap-2 text-xs ${failed ? 'text-red-400' : 'text-txt-2'}`}>
      {state === 'pending' || state === 'saving' ? 'Saving…' : state === 'saved' ? <><span className="text-emerald-500" aria-hidden="true">✓</span> Saved</> : failed ? error : null}
      {state === 'error' && <button type="button" onClick={retry} className="font-medium underline underline-offset-2">Retry</button>}
    </div>
  );
}
