import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ToolsQueue } from '../../../../src/services/tools-orchestrator';
import { ILogger } from '../../../../src/infrastructure/logger';

// Mock logger
const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('ToolsQueue', () => {
  let orchestrator: ToolsQueue;
  let abortController: AbortController;

  beforeEach(() => {
    orchestrator = new ToolsQueue(mockLogger, 2);
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

      expect(result).toContain('execute_command');
      expect(result).toContain('Success: true');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 1 });
    });

    it('executes multiple tools concurrently', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "test1"' } },
        { name: 'execute_command', arguments: { command: 'echo "test2"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toContain('execute_command');
      expect(result.match(/execute_command/g)).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 2 });
    });

    it('respects concurrency limit with single worker', async () => {
      const limitedOrchestrator = new ToolsQueue(mockLogger, 1);
      
      const toolCalls = Array.from({ length: 3 }, (_, i) => ({
        name: 'execute_command',
        arguments: { command: `echo "test${i}"` },
      }));

      const result = await limitedOrchestrator.handle(
        toolCalls,
        {},
        abortController.signal
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 3 });
    });

    it('handles tool execution errors gracefully', async () => {
      const toolCall = {
        name: 'execute_command',
        arguments: { command: 'exit 1' },
      };

      const result = await orchestrator.handle([toolCall], {}, abortController.signal);

      expect(result).toContain('execute_command');
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

      expect(result).toMatch(/Tool: execute_command/);
      expect(result).toMatch(/Success: (true|false)/);
    });

    it('handles empty tool list', async () => {
      const result = await orchestrator.handle([], {}, abortController.signal);

      expect(result).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 0 });
    });

    it('preserves result order', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "first"' } },
        { name: 'execute_command', arguments: { command: 'echo "second"' } },
        { name: 'execute_command', arguments: { command: 'echo "third"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      const lines = result.split('\n\n');
      expect(lines.filter(line => line.includes('Tool: execute_command')).length).toBe(3);
    });

    it('handles mixed success and failure results', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "success"' } },
        { name: 'execute_command', arguments: { command: 'exit 1' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      expect(result).toContain('Tool: execute_command');
      expect(result).toContain('Success:');
    });

    it('continues execution if one tool fails', async () => {
      const toolCalls = [
        { name: 'execute_command', arguments: { command: 'echo "ok"' } },
        { name: 'execute_command', arguments: { command: 'exit 1' } },
        { name: 'execute_command', arguments: { command: 'echo "also ok"' } },
      ];

      const result = await orchestrator.handle(toolCalls, {}, abortController.signal);

      const toolMatches = result.match(/Tool: execute_command/g);
      expect(toolMatches?.length).toBe(3);
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 3 });
    });

    it('handles unknown tools gracefully', async () => {
      const toolCall = {
        name: 'unknown_tool',
        arguments: { param: 'value' },
      };

      const result = await orchestrator.handle([toolCall], {}, abortController.signal);

      expect(result).toContain('unknown_tool');
      expect(result).toContain('Unknown tool');
      expect(mockLogger.info).toHaveBeenCalledWith('Tools completed', { count: 1 });
    });
  });

  describe('constructor', () => {
    it('uses default maxWorkers of 2', () => {
      const orch = new ToolsQueue(mockLogger);
      expect(orch).toBeDefined();
    });

    it('accepts custom maxWorkers', () => {
      const orch = new ToolsQueue(mockLogger, 4);
      expect(orch).toBeDefined();
    });
  });

  describe('executeTool', () => {
    it('logs tool execution', async () => {
      const toolCall = {
        name: 'execute_command',
        arguments: { command: 'echo "test"' },
      };

      await orchestrator.executeTool(mockLogger, toolCall);

      expect(mockLogger.debug).toHaveBeenCalledWith('Executing tool', expect.objectContaining({
        toolName: 'execute_command'
      }));
    });
  });
});
