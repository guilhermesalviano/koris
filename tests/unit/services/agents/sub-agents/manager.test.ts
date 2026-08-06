import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Manager } from '../../../../../src/services/agents/sub-agents/manager';
import type { ILogger } from '../../../../../src/infrastructure/logger';
import type { Message } from '../../../../../src/entities/message';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeMessageService(history: Message[] = []) {
  return {
    getHistory: vi.fn().mockReturnValue(history),
    getSessionId: vi.fn().mockReturnValue('session-1'),
    save: vi.fn(),
  };
}

function makeManager(overrides: Partial<{
  chatComplete: ReturnType<typeof vi.fn>;
  learnerRun: ReturnType<typeof vi.fn>;
  executorRun: ReturnType<typeof vi.fn>;
}> = {}) {
  const logger = makeLogger();
  const chatComplete = overrides.chatComplete ?? vi.fn().mockResolvedValue({ kind: 'message', text: 'done' });
  const learnerRun = overrides.learnerRun ?? vi.fn().mockResolvedValue(undefined);
  const executorRun = overrides.executorRun ?? vi.fn().mockResolvedValue('tool result');

  const manager = new Manager(
    logger,
    'Manager',
    { enqueue: vi.fn() } as never,
    { complete: chatComplete } as never,
    { run: learnerRun } as never,
    { run: executorRun } as never,
  );

  return { manager, logger, chatComplete, learnerRun, executorRun };
}

describe('Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a direct message response from chat completion', async () => {
    const { manager } = makeManager({
      chatComplete: vi.fn().mockResolvedValue({ kind: 'message', text: 'hello user' }),
    });
    const message = makeMessageService();

    const result = await manager.run({
      userMessage: 'hello',
      channel: 'tui',
      message: message as never,
    });

    expect(result).toBe('hello user');
  });

  it('executes non-skill tool calls through the executor worker', async () => {
    const toolCalls = [{ name: 'execute_command', arguments: { command: 'ls' } }];
    const { manager, executorRun } = makeManager({
      chatComplete: vi.fn().mockResolvedValue({ kind: 'tool_calls', calls: toolCalls }),
      executorRun: vi.fn().mockResolvedValue('listed files'),
    });
    const message = makeMessageService([{ role: 'user', content: 'list files' } as Message]);
    const onProgress = vi.fn();

    const result = await manager.run({
      userMessage: 'list files',
      channel: 'tui',
      message: message as never,
      options: { onProgress },
    });

    expect(executorRun).toHaveBeenCalledWith({
      toolCalls,
      userMessage: 'list files',
      messageHistory: [{ role: 'user', content: 'list files' }],
      ctx: expect.objectContaining({
        channel: 'tui',
        onProgress,
      }),
    });
    expect(result).toBe('listed files');
  });

  it('runs the learner before executing tools after get_skill calls', async () => {
    const learnCalls = [{ name: 'get_skill', arguments: { skill_name: 'deploy' } }];
    const executeCalls = [{ name: 'execute_command', arguments: { command: 'deploy' } }];
    const chatComplete = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'tool_calls', calls: learnCalls })
      .mockResolvedValueOnce({ kind: 'tool_calls', calls: executeCalls });
    const { manager, learnerRun, executorRun } = makeManager({
      chatComplete,
      executorRun: vi.fn().mockResolvedValue('deployed'),
    });
    const message = makeMessageService();

    const result = await manager.run({
      userMessage: 'deploy app',
      channel: 'tui',
      message: message as never,
    });

    expect(learnerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCalls: learnCalls,
        userMessage: 'deploy app',
      }),
    );
    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(executorRun).toHaveBeenCalledWith(
      expect.objectContaining({ toolCalls: executeCalls }),
    );
    expect(result).toBe('deployed');
  });

  it('returns an empty string when learning completes without follow-up tools', async () => {
    const learnCalls = [{ name: 'get_skill', arguments: { skill_name: 'deploy' } }];
    const chatComplete = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'tool_calls', calls: learnCalls })
      .mockResolvedValueOnce({ kind: 'message', text: 'skill loaded' });
    const { manager, executorRun } = makeManager({ chatComplete });
    const message = makeMessageService();

    const result = await manager.run({
      userMessage: 'learn deploy',
      channel: 'tui',
      message: message as never,
    });

    expect(result).toBe('skill loaded');
    expect(executorRun).not.toHaveBeenCalled();
  });

  it('returns an empty string when there are no executable tools', async () => {
    const { manager, executorRun } = makeManager({
      chatComplete: vi.fn().mockResolvedValue({ kind: 'tool_calls', calls: [] }),
    });
    const message = makeMessageService();
    const onProgress = vi.fn();

    const result = await manager.run({
      userMessage: 'noop',
      channel: 'tui',
      message: message as never,
      options: { onProgress },
    });

    expect(result).toBe('');
    expect(executorRun).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith('No tools to execute');
  });

  it('uses logger.info as default onProgress callback', async () => {
    const toolCalls = [{ name: 'execute_command', arguments: { command: 'pwd' } }];
    const { manager, logger } = makeManager({
      chatComplete: vi.fn().mockResolvedValue({ kind: 'tool_calls', calls: toolCalls }),
    });
    const message = makeMessageService();

    await manager.run({
      userMessage: 'where am I',
      channel: 'tui',
      message: message as never,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Execution phase: 1 tool(s)'),
    );
  });
});
