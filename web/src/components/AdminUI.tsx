import { useEffect, useState, type ReactNode } from 'react';

interface PageShellProps {
  title: string;
  onRefresh?: () => void;
  children: ReactNode;
}

export function PageShell({ title, onRefresh, children }: PageShellProps) {
  return (
    <>
      <header className="sticky top-0 z-10 flex flex-shrink-0 items-center gap-2.5 border-b border-subtle bg-bg/80 px-6 py-3.5 backdrop-blur-md">
        <h1 className="text-sm font-medium">{title}</h1>
        {onRefresh && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="rounded-lg border border-subtle bg-bg-3 px-3 py-1.5 font-mono text-[11px] text-txt-2 hover:border-accent hover:text-accent-2"
            >
              Refresh
            </button>
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-subtle bg-bg-2 p-5 ${className}`}>{children}</div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center font-mono text-xs text-txt-3">{text}</div>;
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <div className="font-mono text-[11px] uppercase tracking-wide text-txt-3">{label}</div>
      <div className="mt-2 text-2xl font-medium">{value}</div>
    </Card>
  );
}

export function formatDate(value?: string | number | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function useToast(): [string | null, (msg: string, isError?: boolean) => void, boolean] {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(t);
  }, [message]);

  return [message, (msg: string, err = false) => { setMessage(msg); setIsError(err); }, isError];
}

export function Toast({ message, isError }: { message: string | null; isError: boolean }) {
  if (!message) return null;
  return (
    <div
      className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 font-mono text-xs shadow-lg ${
        isError ? 'border-red-500/40 bg-[#2a1212] text-red-300' : 'border-strong bg-bg-3 text-txt'
      }`}
    >
      {message}
    </div>
  );
}
