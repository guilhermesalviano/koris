import type { ReactNode } from 'react';

export interface FeatureProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function Feature({ title, description, icon }: FeatureProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-bg-subtle p-6">
      <div className="h-10 w-10 flex-shrink-0 text-accent">{icon}</div>
      <div>
        <h3 className="mb-1 text-lg font-semibold text-txt">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
