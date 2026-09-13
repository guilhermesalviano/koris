import { useMemo } from 'react';
import { ReadOnlyAgentChat } from '../../../components/chat/ReadOnlyAgentChat';
import { buildNegotiatorChat, loadNegotiatorChat } from '../../../lib/subagent-chat';
import { useReadOnlyData } from '../../../lib/use-read-only-data';

export default function NegotiatorPanel() {
  const { data, loading, error, refresh } = useReadOnlyData(loadNegotiatorChat);
  const entries = useMemo(() => buildNegotiatorChat(data ?? []), [data]);

  return (
    <ReadOnlyAgentChat
      agentId="negotiator"
      title="Negotiator"
      entries={entries}
      loading={loading}
      loaded={data !== null}
      error={error}
      onRefresh={() => void refresh()}
      emptyText="No errands yet. Start an errand from the Orchestrator to see its conversation here."
      historyLabel="Available conversations from the latest 50 errands · up to 100 messages per contact"
    />
  );
}
