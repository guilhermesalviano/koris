const REPO_URL = 'https://github.com/guilhermesalviano/koris-assistant';

export function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" />
      <div className="relative z-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">
          Self-hosted &middot; Open source
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-txt sm:text-5xl">
          An autonomous AI agent, running on your own infrastructure
        </h1>
        <p className="mb-10 text-lg text-muted">
          Koris Assistant is a TypeScript framework for building AI agents with pluggable
          channels, extensible skills, and memory that persists across sessions &mdash; not just
          within a chat window.
        </p>

        <div className="mb-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-bg-subtle p-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
              Install
            </h3>
            <pre className="mb-4 -mx-2 overflow-x-auto rounded-lg bg-bg px-4 py-3 font-mono text-sm text-accent">
              <code>pnpm install</code>
            </pre>
            <p className="text-sm text-muted">
              Then <code className="text-txt">cp settings.example.json settings.json</code> and{' '}
              <code className="text-txt">pnpm build</code>.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg-subtle p-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
              Run
            </h3>
            <pre className="mb-4 -mx-2 overflow-x-auto rounded-lg bg-bg px-4 py-3 font-mono text-sm text-accent">
              <code>pnpm app</code>
            </pre>
            <p className="text-sm text-muted">
              Starts the agent and web dashboard on <code className="text-txt">localhost:3000</code>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-accent px-8 py-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
          >
            View on GitHub
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
