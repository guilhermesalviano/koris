import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Summarizer } from '../../../../../../src/services/agents/sub-agents/summarizer/sub-agent';
import type { ILogger } from '../../../../../../src/infrastructure/logger';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeProps(overrides: Partial<{
  sessionId: string;
  ask: string;
  answer: string;
  type: 'summary' | 'fact';
  channel: string;
}> = {}) {
  return {
    sessionId: 'session-1',
    ask: 'What is TypeScript?',
    answer: 'TypeScript is a typed superset of JavaScript.',
    type: 'summary' as const,
    channel: 'tui',
    memoryService: { upsert: vi.fn() },
    ...overrides,
  };
}

describe('Summarizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the generated summary in memory', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({ kind: 'message', text: 'TS adds static typing.' }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(completionService.complete).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: expect.stringContaining('What is TypeScript?') }],
    });
    expect(props.memoryService.upsert).toHaveBeenCalledWith({
      type: 'summary',
      content: 'TS adds static typing.',
    });
    expect(logger.info).toHaveBeenCalledWith('Summarizer worker completed for session session-1');
  });

  it('logs an error when the model returns tool calls', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({
        kind: 'tool_calls',
        calls: [{ name: 'noop', arguments: {} }],
      }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(props.memoryService.upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to summarize for session session-1',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('logs an error when completion fails', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockRejectedValue(new Error('provider offline')),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps();

    await summarizer.handler(props);

    expect(props.memoryService.upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to summarize for session session-1',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('persists the requested memory type', async () => {
    const logger = makeLogger();
    const completionService = {
      complete: vi.fn().mockResolvedValue({ kind: 'message', text: 'remember this' }),
    };
    const summarizer = new Summarizer(logger, completionService as never);
    const props = makeProps({ type: 'fact' });

    await summarizer.handler(props);

    expect(props.memoryService.upsert).toHaveBeenCalledWith({
      type: 'fact',
      content: 'remember this',
    });
  });
});
