import { REPO_URL, RELEASES_URL } from '@/lib/constants';

export function Hero() {
  return (
    <div className="w-full flex justify-center py-8">
      <div className="max-w-4xl flex flex-col justify-center items-center">
        <h1 className="mb-4 text-5xl text-center font-bold tracking-tight text-txt sm:text-6xl">
          An <b className="text-accent">autonomous AI assistant</b>, running on your own infrastructure
        </h1>
        <p className="mb-10 max-w-xl text-lg text-center text-muted">
          Koris Assistant is a TypeScript framework for building AI assistants with pluggable
          channels, extensible skills, and memory that persists across sessions &mdash; not just
          within a chat window.
        </p>

        <div className="flex flex-wrap gap-4">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-accent px-8 py-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
          >
            Download
          </a>
          <a
            href={`${REPO_URL}#readme`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-border bg-bg-subtle px-8 py-4 text-sm font-semibold text-txt transition-colors hover:border-accent"
          >
            Read the docs
          </a>
        </div>
      </div>
    </div>
  );
}
