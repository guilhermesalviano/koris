const REPO_URL = 'https://github.com/guilhermesalviano/koris-assistant';

export function Footer() {
  return (
    <div className="mt-20 text-center">
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener"
        className="inline-block rounded-lg bg-accent px-12 py-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
      >
        View on GitHub
      </a>
      <span className="ml-3 inline-block rounded-md bg-bg-subtle px-4 py-2 text-xs text-muted">
        ISC License
      </span>

      <footer className="mt-16 pb-12 text-sm text-muted">
        Built with TypeScript &middot; Powered by Node.js
      </footer>
    </div>
  );
}
