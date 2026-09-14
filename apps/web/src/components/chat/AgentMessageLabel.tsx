import { Link } from 'react-router-dom';
import { agentName, agentPath } from '../../lib/agents';
import { useAgents } from '../../lib/use-agents';
import type { AgentId } from '../../lib/types';

export function AgentMessageLabel({ senderAgentId }: { senderAgentId: AgentId }) {
  const { agents } = useAgents();
  const name = agentName(senderAgentId, agents);
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-caption text-txt-3" aria-label={`Message from ${name} to Orchestrator`}>
      <Link to={agentPath(senderAgentId)} className="font-medium text-txt-2 hover:text-accent-2 focus-visible:outline-2 focus-visible:outline-accent">{name}</Link>
      <span aria-hidden="true">→</span>
      <span>Orchestrator</span>
    </div>
  );
}
