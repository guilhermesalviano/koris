import type { ComponentType } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { agentPath, ORCHESTRATOR_ID } from '../../../lib/agents';
import { useAgents } from '../../../lib/use-agents';
import OrchestratorPage from './OrchestratorPage';
import NegotiatorPanel from './NegotiatorPanel';
import WatcherPanel from './WatcherPanel';
import GenericAgentPanel from './GenericAgentPanel';

/** Agents with a purpose-built screen; any other listed sub-agent gets the generic panel. */
export const AGENT_SCREENS: Readonly<Record<string, ComponentType>> = {
  orchestrator: OrchestratorPage,
  negotiator: NegotiatorPanel,
  heartbeat: WatcherPanel,
};

export default function AgentScreen() {
  const { agentId = '' } = useParams();
  const { agents, loading } = useAgents();
  const Screen = AGENT_SCREENS[agentId];
  if (Screen) return <Screen />;
  if (loading) return null;
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) return <Navigate to={agentPath(ORCHESTRATOR_ID)} replace />;
  return <GenericAgentPanel key={agent.id} agent={agent} />;
}
