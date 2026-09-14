import { useCallback, useMemo } from 'react';
import { ReadOnlyAgentChat } from '../../../components/chat/ReadOnlyAgentChat';
import { buildAgentAuditChat, loadAgentAudit } from '../../../lib/subagent-chat';
import { useReadOnlyData } from '../../../lib/use-read-only-data';
import type { AgentSummary } from '../../../lib/types';

export default function GenericAgentPanel({ agent }: { agent: AgentSummary }) {
  const load = useCallback((signal: AbortSignal) => loadAgentAudit(agent.id, signal), [agent.id]);
  const { data, loading, error, refresh } = useReadOnlyData(load);
  const entries = useMemo(() => buildAgentAuditChat(data ?? [], agent.name), [data, agent.name]);

  return (
    <ReadOnlyAgentChat
      agentId={agent.id}
      title={agent.name}
      entries={entries}
      loading={loading}
      loaded={data !== null}
      error={error}
      onRefresh={() => void refresh()}
      emptyText={`${agent.name} has not made any model calls yet.`}
      historyLabel="Latest 50 model calls"
    >
      {agent.description && <p className="text-caption text-txt-3">{agent.description}</p>}
    </ReadOnlyAgentChat>
  );
}
