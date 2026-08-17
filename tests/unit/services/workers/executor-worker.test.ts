import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutorWorker } from '../../../../src/services/workers/executor-worker';
import { EXECUTOR_SYNTHESIS_RULES } from '../../../../src/constants';
import type { ILogger } from '../../../../src/infrastructure/logger';
import type { LoopContext } from '../../../../src/types/context';
import type { ToolCall } from '../../../../src/types/tools';
import type { Message } from '../../../../src/entities/message';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeContext(overrides: Partial<LoopContext> = {}): LoopContext {
  return {
    channel: 'tui',
    toolsQueue: { handle: vi.fn().mockResolvedValue([{ success: true, toolName: 'execute_command', result: 'done' }]) } as never,
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
  };
}

function makeWorker(overrides: Partial<{
  workerComplete: ReturnType<typeof vi.fn>;
  managerComplete: ReturnType<typeof vi.fn>;
}> = {}) {
  const workerComplete = overrides.workerComplete ?? vi.fn().mockResolvedValue({ kind: 'message', text: 'worker answer' });
  const managerComplete = overrides.managerComplete ?? vi.fn().mockResolvedValue({ kind: 'message', text: 'manager answer' });

  const executor = new ExecutorWorker(
    makeLogger(),
    'executorWorker',
    { complete: workerComplete } as never,
    { complete: managerComplete } as never,
  );

  return { executor, workerComplete, managerComplete };
}

const toolCalls: ToolCall[] = [{ name: 'execute_command', arguments: { command: 'ls' } }];

describe('ExecutorWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the manager chat service for manager-initiated flows', async () => {
    const { executor, workerComplete, managerComplete } = makeWorker();

    const result = await executor.run({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [{ role: 'user', content: 'list files' } as Message],
      ctx: makeContext({ initiatedBy: 'manager' }),
    });

    expect(result).toBe('manager answer');
    expect(managerComplete).toHaveBeenCalled();
    expect(workerComplete).not.toHaveBeenCalled();
  });

  it('uses the manager chat service when no initiator is set', async () => {
    const { executor, workerComplete, managerComplete } = makeWorker();

    await executor.run({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [],
      ctx: makeContext(),
    });

    expect(managerComplete).toHaveBeenCalled();
    expect(workerComplete).not.toHaveBeenCalled();
  });

  it('uses the worker chat service for heartbeat-initiated flows', async () => {
    const { executor, workerComplete, managerComplete } = makeWorker();

    const result = await executor.run({
      toolCalls,
      userMessage: 'send status',
      messageHistory: [],
      ctx: makeContext({ channel: 'background', initiatedBy: 'heartbeat' }),
    });

    expect(result).toBe('worker answer');
    expect(workerComplete).toHaveBeenCalled();
    expect(managerComplete).not.toHaveBeenCalled();
  });

  it('uses the worker chat service for summarizer-initiated flows', async () => {
    const { executor, workerComplete, managerComplete } = makeWorker();

    await executor.run({
      toolCalls,
      userMessage: 'summarize',
      messageHistory: [],
      ctx: makeContext({ channel: 'background', initiatedBy: 'summarizer' }),
    });

    expect(workerComplete).toHaveBeenCalled();
    expect(managerComplete).not.toHaveBeenCalled();
  });

  it('passes the synthesis data and rules to the selected chat service', async () => {
    const { executor, managerComplete } = makeWorker();

    await executor.run({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [{ role: 'user', content: 'list files' } as Message],
      ctx: makeContext({ initiatedBy: 'manager' }),
    });

    expect(managerComplete).toHaveBeenCalledWith(
      expect.stringContaining('list files'),
      'tui',
      undefined,
      [{ role: 'user', content: 'list files' }],
      undefined,
      [EXECUTOR_SYNTHESIS_RULES],
    );
  });

  it('recurses when the chat service returns more tool calls', async () => {
    const { executor, managerComplete } = makeWorker({
      managerComplete: vi.fn()
        .mockResolvedValueOnce({ kind: 'tool_calls', calls: toolCalls })
        .mockResolvedValueOnce({ kind: 'message', text: 'final answer' }),
    });

    const result = await executor.run({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [],
      ctx: makeContext({ initiatedBy: 'manager' }),
    });

    expect(result).toBe('final answer');
    expect(managerComplete).toHaveBeenCalledTimes(2);
  });

  it('returns a warning when the max iteration count is reached', async () => {
    const { executor, workerComplete, managerComplete } = makeWorker();

    const result = await executor.run({
      toolCalls,
      userMessage: 'loop',
      messageHistory: [],
      ctx: makeContext({ initiatedBy: 'manager' }),
      iteration: 10,
      maxIterations: 10,
    });

    expect(result).toContain('Maximum tool execution iterations');
    expect(managerComplete).not.toHaveBeenCalled();
    expect(workerComplete).not.toHaveBeenCalled();
  });
});