import { Link } from 'react-router-dom';
import { agentPath } from '../../lib/agents';
import type { AgentId } from '../../lib/types';

const NAMES: Record<AgentId, string> = { orchestrator: 'Orchestrator', negotiator: 'Negotiator', watcher: 'Watcher' };

export function AgentMessageLabel({ senderAgentId }: { senderAgentId: AgentId }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-caption text-txt-3" aria-label={`Message from ${NAMES[senderAgentId]} to Orchestrator`}>
      <Link to={agentPath(senderAgentId)} className="font-medium text-txt-2 hover:text-accent-2 focus-visible:outline-2 focus-visible:outline-accent">{NAMES[senderAgentId]}</Link>
      <span aria-hidden="true">→</span>
      <span>Orchestrator</span>
    </div>
  );
}
