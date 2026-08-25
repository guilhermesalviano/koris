import Image from 'next/image';
import { BASE_PATH, REPO_URL } from '@/lib/constants';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#changelog', label: 'Changelog' },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex gap-6">
          <a href="#" className="flex items-center gap-2">
            <Image src={`${BASE_PATH}/logo.png`} alt="" width={28} height={28} className="rounded-md" />
            <span className="text-md font-semibold tracking-tight text-txt">koris</span>
          </a>

          <div className="hidden items-center gap-2 sm:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-md text-muted transition-colors hover:text-txt"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-border bg-bg-subtle px-4 py-2 text-md font-semibold text-txt transition-colors hover:border-accent"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
