import { REPO_URL } from '@/lib/constants';

const STEPS = [
  {
    number: '01',
    title: 'Download',
    command: 'pnpm install',
    detail: 'Clone the repo, or grab a release, then install dependencies.',
    link: { label: 'View releases', href: `${REPO_URL}/releases` },
  },
  {
    number: '02',
    title: 'Configure',
    command: 'cp settings.example.json settings.json\npnpm build',
    detail: 'Copy the example config and build the project.',
  },
  {
    number: '03',
    title: 'Run',
    command: 'pnpm app',
    detail: 'Starts the agent and web dashboard on localhost:3000.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mt-24 scroll-mt-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-bold tracking-tight text-txt sm:text-4xl">How it works</h2>
        <p className="mt-3 text-muted">Three steps between clone and a running agent.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.number} className="rounded-xl border border-border bg-bg-subtle p-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-accent">{step.number}</span>
              {step.link && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener"
                  className="text-xs font-semibold text-muted transition-colors hover:text-accent"
                >
                  {step.link.label} &rarr;
                </a>
              )}
            </div>
            <h3 className="mb-3 text-lg font-semibold text-txt">{step.title}</h3>
            <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-bg px-4 py-3 font-mono text-xs text-accent sm:text-sm">
              <code>{step.command}</code>
            </pre>
            <p className="text-sm text-muted">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
