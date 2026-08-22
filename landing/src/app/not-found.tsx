import Link from 'next/link';
import { REPO_URL } from '@/lib/constants';
import { MemoryIcon } from '@/components/icons';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-muted text-accent">
        <div className="h-7 w-7">
          <MemoryIcon />
        </div>
      </div>

      <h1 className="text-7xl font-bold tracking-tight text-txt sm:text-8xl">
        4<span className="text-accent">0</span>4
      </h1>

      <h2 className="mt-4 max-w-lg text-2xl font-semibold text-txt sm:text-3xl">
        Even an agent with persistent memory forgot this page.
      </h2>

      <p className="mt-4 max-w-md text-muted">
        We checked the long-term memory store, ran a full skill sync, and sent a heartbeat
        to ask nicely. This route just isn&apos;t in the training data &mdash; it probably
        wandered off to go summarize itself.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Link
          href="/"
          className="rounded-lg bg-accent px-8 py-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
        >
          Take me home
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-border bg-bg-subtle px-8 py-4 text-sm font-semibold text-txt transition-colors hover:border-accent"
        >
          File a bug report
        </a>
      </div>

      <p className="mt-10 font-mono text-xs text-muted">
        status: 404 &middot; heartbeat still running, don&apos;t worry
      </p>
    </main>
  );
}
