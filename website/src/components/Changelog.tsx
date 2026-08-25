import { getChangelogEntries } from '@/lib/changelog';
import { REPO_URL } from '@/lib/constants';

export function Changelog() {
  const entries = getChangelogEntries();
  if (entries.length === 0) return null;

  return (
    <section id="changelog" className="mt-24 scroll-mt-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-bold tracking-tight text-txt sm:text-4xl">Changelog</h2>
        <p className="mt-3 text-muted">What&apos;s shipped, straight from the source.</p>
      </div>

      <div className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4">
        {entries.map((entry) => (
          <div
            key={entry.version}
            className="flex w-[260px] flex-shrink-0 snap-start flex-col rounded-xl border border-border bg-bg-subtle p-6"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-lg font-semibold text-txt">v{entry.version}</span>
              {entry.date && <span className="text-xs text-muted">{entry.date}</span>}
            </div>
            <p className="text-sm text-muted">{entry.summary}</p>
          </div>
        ))}

        <a
          href={`${REPO_URL}/blob/main/CHANGELOG.md`}
          target="_blank"
          rel="noopener"
          className="flex w-[200px] flex-shrink-0 snap-start flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm font-semibold text-txt transition-colors hover:border-accent"
        >
          View full changelog
          <span aria-hidden className="text-accent">
            &rarr;
          </span>
        </a>
      </div>
    </section>
  );
}
