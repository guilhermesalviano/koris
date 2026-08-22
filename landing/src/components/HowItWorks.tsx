import { RELEASES_URL } from '@/lib/constants';

const STEPS = [
  {
    number: '01',
    title: 'Download',
    command: '# Download the source zip from the latest release',
    detail: 'Grab the latest release from GitHub and unzip it.',
    link: { label: 'View releases', href: RELEASES_URL },
  },
  {
    number: '02',
    title: 'Unzip',
    command: 'unzip koris-<version>.zip\ncd koris-<version>',
    detail: 'Extract the archive and enter the project folder.',
  },
  {
    number: '03',
    title: 'Install dependencies',
    command: 'pnpm install',
    detail: 'Installs all workspace dependencies (root, web/, landing/).',
  },
  {
    number: '04',
    title: 'Configure & build',
    command: 'pnpm build && pnpm app',
    detail:
      'First run with no settings.json launches straight into a setup wizard in your browser — no manual JSON editing needed.',
  },
  {
    number: '05',
    title: 'Open the dashboard',
    command: 'open http://localhost:3000/koris',
    detail: 'Finish the wizard (AI provider, Telegram/WhatsApp, personal info) and your assistant is live.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mt-24 scroll-mt-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-bold tracking-tight text-txt sm:text-4xl">How it works</h2>
        <p className="mt-3 text-muted">Five steps between download and a running agent.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
