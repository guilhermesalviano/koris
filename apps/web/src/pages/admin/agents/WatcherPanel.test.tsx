import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BeatCard } from './WatcherPanel';
import { ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { buildWatcherChat } from '../../../lib/subagent-chat';
import type { AuditItem, HeartbeatItem } from '../../../lib/types';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const beat: HeartbeatItem = {
  id: 'beat-1',
  beat: 'Send me the weather forecast',
  type: 'scheduled_beat',
  cron_expression: '0 9 * * *',
  channel: 'telegram',
  target: '42',
  run_once: false,
  last_run: '2026-09-13T11:30:00.000Z',
  next_run: '2026-09-13T15:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
};

function run(props: Partial<AuditItem> = {}): AuditItem {
  return {
    id: 'a1',
    runId: 'beat-1',
    type: 'llm',
    role: 'worker',
    agentName: 'heartbeat',
    model: 'gemma',
    durationMs: 1200,
    status: 'success',
    responsePreview: 'Sunny, 24°C',
    createdAt: '2026-09-13T11:30:00.000Z',
    ...props,
  };
}

describe('BeatCard', () => {
  it('shows the task, type, schedule, destination and relative run times', () => {
    const html = renderToStaticMarkup(<BeatCard beat={beat} now={NOW} />);

    expect(html).toContain('Send me the weather forecast');
    expect(html).toContain('Scheduled task');
    expect(html).toContain('Every day at 9 AM');
    expect(html).toContain('→ telegram · 42');
    expect(html).toContain('30 min ago');
    expect(html).toContain('in 3 h');
  });
});

describe('Watcher chat messages', () => {
  it('shows the scheduled task and full response with the Watcher avatar', () => {
    const entry = buildWatcherChat({ beats: [beat], runs: [run({ response: '**Sunny**, 24°C with clear skies all day.' })] })[0];
    const html = renderToStaticMarkup(<ReadOnlyChatMessage entry={entry} agentId="watcher" />);
    expect(html).toContain('Send me the weather forecast');
    expect(html).toContain('<strong>Sunny</strong>');
    expect(html).toContain('clear skies all day.');
    expect(html).toContain('/agents/watcher.jpg');
  });

  it('shows failed activity for a deleted beat without offering resend', () => {
    const entry = buildWatcherChat({ beats: [], runs: [run({ status: 'error', type: 'tool', toolName: 'web_search', errorMessage: 'timeout', runId: 'deleted-beat-xyz' })] })[0];
    const html = renderToStaticMarkup(<ReadOnlyChatMessage entry={entry} agentId="watcher" />);
    expect(html).toContain('timeout');
    expect(html).toContain('deleted-beat-xyz');
    expect(html).toContain('Activity details');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<details open');
  });
});
