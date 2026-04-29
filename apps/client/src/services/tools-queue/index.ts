import pLimit from "p-limit";
import { ToolCall, ToolResult } from "../../types/tools";
import { COMMAND_MAP } from "./tools";
import type { ILogger } from "../../infrastructure/logger";

interface AIAgentRequest {
  model?: string;
}

interface IToolsQueue {
  handle(
    tools: ToolCall[],
    _agent: AIAgentRequest,
    signal: AbortSignal,
  ): Promise<ToolResult[]>;
}

class ToolsQueue implements IToolsQueue {
  constructor(
    private logger: ILogger,
    private maxWorkers: number = 2
  ) { }

  async handle(
    tools: ToolCall[],
    _agent: AIAgentRequest,
    signal: AbortSignal,
  ): Promise<ToolResult[]> {
    const limit = pLimit(this.maxWorkers);

    const promises = tools.map((tool) =>
      limit(async () => {
        if (signal.aborted) {
          throw new Error('Tool execution aborted');
        }

        try {
          return await this.executeTool(this.logger, tool);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.error('Tool execution failed', { toolName: tool.name, error: errorMsg });
          return {
            toolName: tool.name,
            success: false,
            error: errorMsg,
          } as ToolResult;
        }
      })
    );

    const results = await Promise.all(promises);

    this.logger.info('Tools completed', { count: results.length });

    return results;
  }

  async executeTool(logger: ILogger, toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;
    logger.debug('Executing tool', {
      toolName: name,
      args,
    });

    try {
      const command = COMMAND_MAP[name];
      if (command) return await command(logger, args);

      return {
        toolName: name,
        success: false,
        error: `Unknown tool: ${name}`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Tool execution error', { toolName: name, error: errorMsg });
      return {
        toolName: name,
        success: false,
        error: errorMsg,
      };
    }
  }
}

export { ToolsQueue, IToolsQueue };