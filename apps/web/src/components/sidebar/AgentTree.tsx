import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { agentPath, type AgentNode } from '../../lib/agents';
import type { AgentId } from '../../lib/types';
import { cn } from '../../lib/cn';
import { ChatIcon, ErrandsIcon, HeartbeatsIcon } from '../Icons';

const AGENT_ICONS: Record<AgentId, ComponentType<{ className?: string }>> = {
  orchestrator: ChatIcon,
  negotiator: ErrandsIcon,
  watcher: HeartbeatsIcon,
};

const ICON_CLASS = 'h-4 w-4 flex-shrink-0 fill-none stroke-current';

function AgentRow({ node, depth, onNavigate }: { node: AgentNode; depth: number; onNavigate?: () => void }) {
  const { agent } = node;
  const Icon = AGENT_ICONS[agent.id] ?? ChatIcon;

  return (
    <li>
      <NavLink
        to={agentPath(agent.id)}
        onClick={onNavigate}
        title={agent.description}
        className={({ isActive }) =>
          cn(
            'flex w-full items-center gap-2.5 rounded-control border border-transparent py-2 pr-3',
            'text-body transition-colors duration-150 outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent/40',
            depth === 0 ? 'pl-3' : 'pl-8',
            isActive ? 'border-accent-muted bg-accent-muted text-accent-2' : 'text-txt-2 hover:bg-bg-3 hover:text-txt',
          )
        }
      >
        <Icon className={ICON_CLASS} />
        <span className="truncate">{agent.name}</span>
        {!agent.messageable && (
          <span className="ml-auto font-mono text-micro uppercase text-txt-3" aria-label="Read-only">
            ro
          </span>
        )}
      </NavLink>
      {node.children.length > 0 && (
        <ul className="relative mt-0.5 space-y-0.5 before:absolute before:inset-y-0 before:left-5 before:w-px before:bg-subtle">
          {node.children.map((child) => (
            <AgentRow key={child.agent.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Roster tree: top-level agents with their sub-agents indented beneath them. */
export function AgentTree({ nodes, onNavigate }: { nodes: AgentNode[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <AgentRow key={node.agent.id} node={node} depth={0} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}
