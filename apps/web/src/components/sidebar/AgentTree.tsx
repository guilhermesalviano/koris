import { NavLink } from 'react-router-dom';
import { agentPath, type AgentNode } from '../../lib/agents';
import { cn } from '../../lib/cn';
import { AgentAvatar } from '../AgentAvatar';

function AgentRow({ node, depth, onNavigate }: { node: AgentNode; depth: number; onNavigate?: () => void }) {
  const { agent } = node;
  const isSubAgent = depth > 0;

  return (
    <li>
      <NavLink
        to={agentPath(agent.id)}
        onClick={onNavigate}
        title={agent.description}
        className={({ isActive }) =>
          cn(
            'flex w-full items-center gap-2.5 rounded-control border border-transparent py-1.5 pl-3 pr-3',
            'text-body transition-colors duration-150 outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent/40',
            isActive ? 'border-accent-muted bg-accent-muted text-accent-2' : 'text-txt-2 hover:bg-bg-3 hover:text-txt',
          )
        }
      >
        <AgentAvatar id={agent.id} className="h-7 w-7" />
        <span className="truncate">{agent.name}</span>
        {isSubAgent && (
          <span className="ml-auto flex-shrink-0 rounded-full border border-subtle px-1.5 py-0.5 font-mono text-micro text-txt-3">
            sub agent
          </span>
        )}
      </NavLink>
      {node.children.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <AgentRow key={child.agent.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Roster: each agent followed by its sub-agents, same size, told apart by a "sub agent" tag. */
export function AgentTree({ nodes, onNavigate }: { nodes: AgentNode[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <AgentRow key={node.agent.id} node={node} depth={0} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}
