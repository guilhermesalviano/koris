import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolCallPipeline } from '../../../../src/services/agents/tool-call-pipeline';
import type { Message } from '../../../../src/entities/message';
import type { LoopContext } from '../../../../src/types/context';

function makeContext(overrides: Partial<LoopContext> = {}): LoopContext {
  return {
    channel: 'tui',
    toolsQueue: { handle: vi.fn() } as never,
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
  };
}

function makePipeline(overrides: Partial<{
  chatComplete: ReturnType<typeof vi.fn>;
  learnerRun: ReturnType<typeof vi.fn>;
  executorRun: ReturnType<typeof vi.fn>;
}> = {}) {
  const chatComplete = overrides.chatComplete ?? vi.fn().mockResolvedValue({ kind: 'message', text: 'done' });
  const learnerRun = overrides.learnerRun ?? vi.fn().mockResolvedValue(true);
  const executorRun = overrides.executorRun ?? vi.fn().mockResolvedValue('tool result');

  const pipeline = new ToolCallPipeline(
    { complete: chatComplete } as never,
    { run: learnerRun } as never,
    { run: executorRun } as never,
  );

  return { pipeline, chatComplete, learnerRun, executorRun };
}

describe('ToolCallPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes non-skill tool calls through the executor worker', async () => {
    const toolCalls = [{ name: 'execute_command', arguments: { command: 'ls' } }];
    const { pipeline, executorRun } = makePipeline({
      executorRun: vi.fn().mockResolvedValue('listed files'),
    });
    const onProgress = vi.fn();

    const result = await pipeline.execute(
      toolCalls,
      'list files',
      [{ role: 'user', content: 'list files' } as Message],
      makeContext({ onProgress }),
    );

    expect(executorRun).toHaveBeenCalledWith({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [{ role: 'user', content: 'list files' }],
      ctx: expect.objectContaining({ channel: 'tui', onProgress }),
    });
    expect(result).toBe('listed files');
  });

  it('runs the learner before executing tools after get_skill calls', async () => {
    const learnCalls = [{ name: 'get_skill', arguments: { skill_name: 'deploy' } }];
    const executeCalls = [{ name: 'execute_command', arguments: { command: 'deploy' } }];
    const chatComplete = vi.fn().mockResolvedValue({ kind: 'tool_calls', calls: executeCalls });
    const { pipeline, learnerRun, executorRun } = makePipeline({
      chatComplete,
      executorRun: vi.fn().mockResolvedValue('deployed'),
    });

    const result = await pipeline.execute(learnCalls, 'deploy app', [], makeContext());

    expect(learnerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCalls: learnCalls,
        userMessage: 'deploy app',
      }),
    );
    expect(chatComplete).toHaveBeenCalledWith(
      expect.stringContaining('deploy app'),
      'tui',
      undefined,
      [],
      undefined,
    );
    expect(executorRun).toHaveBeenCalledWith(
      expect.objectContaining({ toolCalls: executeCalls }),
    );
    expect(result).toBe('deployed');
  });

  it('returns the message when the skill-ready completion responds without tools', async () => {
    const learnCalls = [{ name: 'get_skill', arguments: { skill_name: 'deploy' } }];
    const { pipeline, executorRun } = makePipeline({
      chatComplete: vi.fn().mockResolvedValue({ kind: 'message', text: 'skill loaded' }),
    });

    const result = await pipeline.execute(learnCalls, 'learn deploy', [], makeContext());

    expect(result).toBe('skill loaded');
    expect(executorRun).not.toHaveBeenCalled();
  });

  it('returns an empty string when there are no executable tools', async () => {
    const { pipeline, executorRun } = makePipeline();
    const onProgress = vi.fn();

    const result = await pipeline.execute([], 'noop', [], makeContext({ onProgress }));

    expect(result).toBe('');
    expect(executorRun).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith('No tools to execute');
  });
});
