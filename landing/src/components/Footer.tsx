import { RELEASES_URL } from '@/lib/constants';

export function Footer() {
  return (
    <div className="mt-24 border-t border-border pt-12 text-center">
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener"
        className="inline-block rounded-lg bg-accent px-12 py-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
      >
        Download
      </a>
      <span className="ml-3 inline-block rounded-md bg-bg-subtle px-4 py-2 text-xs text-muted">
        ISC License
      </span>

      <footer className="mt-16 pb-12 text-sm text-muted">
        Built with ❤️ by Koaris
      </footer>
    </div>
  );
}
