import { useState } from 'react';
import { agentAvatarUrl } from '../lib/agents';
import type { AgentId } from '../lib/types';
import { cn } from '../lib/cn';

/** An agent's round portrait, or its initial when no portrait ships for it. Decorative: the agent's name is always shown beside it. */
export function AgentAvatar({ id, className, unread = false }: { id: AgentId; className?: string; unread?: boolean }) {
  const [failedId, setFailedId] = useState<AgentId | null>(null);
  const missing = failedId === id;

  return (
    <span className={cn('relative inline-flex h-10 w-10 flex-shrink-0 rounded-full', unread && 'ring-2 ring-accent ring-offset-2 ring-offset-bg-2', className)}>
      {missing ? (
        <span aria-hidden="true" className="flex h-full w-full items-center justify-center rounded-full border border-subtle bg-bg-3 font-medium uppercase text-txt-2">
          {id.charAt(0)}
        </span>
      ) : (
        <img
          src={agentAvatarUrl(id)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          onError={() => setFailedId(id)}
          className="h-full w-full rounded-full border border-subtle bg-bg-3 object-cover"
        />
      )}
      {unread && <>
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg-2 bg-accent">
          <span className="absolute inset-0 rounded-full bg-accent motion-safe:animate-ping" />
        </span>
        <span className="sr-only">Unread activity</span>
      </>}
    </span>
  );
}
