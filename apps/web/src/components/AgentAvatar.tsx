import { agentAvatarUrl } from '../lib/agents';
import type { AgentId } from '../lib/types';
import { cn } from '../lib/cn';

/** An agent's round portrait. Decorative: the agent's name is always shown beside it. */
export function AgentAvatar({ id, className }: { id: AgentId; className?: string }) {
  return (
    <img
      src={agentAvatarUrl(id)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      draggable={false}
      className={cn('h-6 w-6 flex-shrink-0 rounded-full border border-subtle bg-bg-3 object-cover', className)}
    />
  );
}
