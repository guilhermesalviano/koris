import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BeatCard } from './WatcherPanel';
import { ReadOnlyChatMessage } from '../../../components/chat/ReadOnlyAgentChat';
import { buildWatcherChat } from '../../../lib/subagent-chat';
import type { BeatRunItem, HeartbeatItem } from '../../../lib/types';

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

function run(props: Partial<BeatRunItem> = {}): BeatRunItem {
  return {
    id: 'run-1',
    beatId: 'beat-1',
    beat: 'Send me the weather forecast',
    type: 'scheduled_beat',
    status: 'success',
    result: 'Sunny, 24°C',
    errorMessage: null,
    startedAt: '2026-09-13T11:30:00.000Z',
    finishedAt: '2026-09-13T11:30:04.000Z',
    tools: [],
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
  it('shows the task that ran and the full response with the Watcher avatar', () => {
    const [task, reply] = buildWatcherChat({ beats: [beat], runs: [run({ result: '**Sunny**, 24°C with clear skies all day.', tools: [{ name: 'search_engine', status: 'success' }] })] });
    const taskHtml = renderToStaticMarkup(<ReadOnlyChatMessage entry={task} agentId="watcher" />);
    expect(taskHtml).toContain('Send me the weather forecast');
    expect(taskHtml).toContain('Current status: Completed');
    expect(taskHtml).toContain('Run details');
    expect(taskHtml).toContain('search_engine');
    expect(taskHtml).not.toContain('/agents/watcher.jpg');

    const html = renderToStaticMarkup(<ReadOnlyChatMessage entry={reply} agentId="watcher" />);
    expect(html).toContain('<strong>Sunny</strong>');
    expect(html).toContain('clear skies all day.');
    expect(html).toContain('/agents/watcher.jpg');
  });

  it('shows a failed run of a deleted beat without offering resend', () => {
    const entries = buildWatcherChat({ beats: [], runs: [run({ status: 'error', result: null, errorMessage: 'timeout', beat: 'Old one-time reminder', type: 'reminder' })] });
    const html = entries.map((entry) => renderToStaticMarkup(<ReadOnlyChatMessage entry={entry} agentId="watcher" />)).join('');
    expect(html).toContain('Old one-time reminder');
    expect(html).toContain('timeout');
    expect(html).toContain('Current status: Failed');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<details open');
  });
});
