import { cn } from '../../lib/cn';

/**
 * Marker dropped between two turns: a time/day label when they are far enough
 * apart (`lib/date`'s `chatSeparatorLabel`), or — with `session` — the start of a
 * new session in the Orchestrator thread (`lib/timeline`'s `buildThread`). A
 * compacted session can carry the summary it resumed from.
 */
export function DateSeparator({
  label,
  session = false,
  summary,
}: {
  label: string;
  session?: boolean;
  summary?: string | null;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-3" role="separator" aria-label={label}>
        <div className={cn('h-px flex-1 border-t', session ? 'border-accent-muted' : 'border-subtle')} />
        <span
          className={cn(
            'flex-shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-micro',
            session ? 'uppercase text-accent-2 border-accent-muted bg-accent-muted' : 'uppercase text-txt-3 border-subtle bg-bg-2',
          )}
        >
          {label}
        </span>
        <div className={cn('h-px flex-1 border-t', session ? 'border-accent-muted' : 'border-subtle')} />
      </div>
      {summary && (
        <details className="group mx-auto mt-2 max-w-[60ch] text-center">
          <summary className="cursor-pointer list-none font-mono text-micro text-txt-3 transition-colors hover:text-txt-2">
            <span className="group-open:hidden">Show carried-over summary</span>
            <span className="hidden group-open:inline">Hide summary</span>
          </summary>
          <div className="mt-2 whitespace-pre-wrap rounded-card border border-subtle bg-bg-2 px-3 py-2 text-left text-caption text-txt-2">
            {summary}
          </div>
        </details>
      )}
    </div>
  );
}
