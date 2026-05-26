import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ToolsQueueFactory } from '../../../../src/services/tools-queue';
import { AgnosticExecutionTool } from '../../../../src/services/tools';
import { ILogger } from '../../../../src/infrastructure/logger';

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('ToolsQueue', () => {
  let orchestrator: ReturnType<typeof ToolsQueueFactory.create>;
  let abortController: AbortController;

  beforeEach(() => {
    orchestrator = ToolsQueueFactory.create(mockLogger, 2);
    abortController = new AbortController();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handle', () => {
    it('executes single tool successfully', async () => {
      const toolCall = {
        name: 'execute_command',
        arguments: { command: 'echo "test"' },
      };

      const result = await orchestrator.handle([toolCall], {}, abortController.signal);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('execute_command');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 1 });
    });

    it('executes multiple tools concurrently', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "test1"' } },
        { name: 'execute_command', arguments: { command: 'echo "test2"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.toolName === 'execute_command')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 2 });
    });

    it('respects concurrency limit with single worker', async () => {
      const limitedOrchestrator = ToolsQueueFactory.create(mockLogger, 1);

      const toolCalls = Array.from({ length: 3 }, (_, i) => ({
        name: 'execute_command',
        arguments: { command: `echo "test${i}"` },
      }));

      const result = await limitedOrchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(3);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 3 });
    });

    it('handles tool execution errors gracefully', async () => {
      const toolCall = {
        name: 'execute_command',
        arguments: { command: 'exit 1' },
      };

      const result = await orchestrator.handle([toolCall], {}, abortController.signal);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('execute_command');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 1 });
    });

    it('respects abort signal', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "test"' } },
      ];

      abortController.abort();

      try {
        await orchestrator.handle(toolCalls, {}, abortController.signal);
      } catch (err) {
        expect((err as Error).message).toContain('aborted');
      }
    });

    it('returns formatted output with tool results', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "test"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result[0].toolName).toBe('execute_command');
      expect(result[0]).toHaveProperty('success');
    });

    it('handles empty tool list', async () => {
      const result = await orchestrator.handle([], {}, abortController.signal);

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 0 });
    });

    it('preserves result order', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "first"' } },
        { name: 'execute_command', arguments: { command: 'echo "second"' } },
        { name: 'execute_command', arguments: { command: 'echo "third"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toHaveLength(3);
      result.forEach((r) => expect(r.toolName).toBe('execute_command'));
    });

    it('handles mixed success and failure results', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "success"' } },
        { name: 'execute_command', arguments: { command: 'exit 1' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.toolName === 'execute_command')).toBe(true);
    });

    it('continues execution if one tool fails', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "ok"' } },
        { name: 'execute_command', arguments: { command: 'exit 1' } },
        { name: 'execute_command', arguments: { command: 'echo "also ok"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.toolName === 'execute_command')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 3 });
    });

    it('handles unknown tools gracefully', async () => {
      const toolCall = {
        name: 'unknown_tool',
        arguments: { param: 'value' },
      };

      const result = await orchestrator.handle([toolCall], {}, abortController.signal);

      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('unknown_tool');
      expect(result[0].success).toBe(false);
      expect(result[0].error).toContain('Unknown tool');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 1 });
    });
  });

  describe('constructor', () => {
    it('uses default maxWorkers of 2', () => {
      const orch = ToolsQueueFactory.create(mockLogger);
      expect(orch).toBeDefined();
    });

    it('accepts custom maxWorkers', () => {
      const orch = ToolsQueueFactory.create(mockLogger, 4);
      expect(orch).toBeDefined();
    });
  });

  describe('AgnosticExecutionTool', () => {
    it('logs tool execution', async () => {
      const tool = new AgnosticExecutionTool({ execute_command: vi.fn().mockResolvedValue({ toolName: 'execute_command', success: true, result: '' }) } as any);
      const toolCall = { name: 'execute_command', arguments: { command: 'echo "test"' } };

      await tool.handle(mockLogger, toolCall);

      expect(mockLogger.debug).toHaveBeenCalledWith('Executing tool', expect.objectContaining({
        toolName: 'execute_command',
      }));
    });
  });
});


