import pLimit from "p-limit";
import { ILogger } from "../../infrastructure/logger";
import { ToolCall, ToolResult } from "../../types/tools";
import { COMMAND_MAP } from "./tools";

interface AIAgentRequest {
  model?: string;
}

class ToolsQueue {
  constructor(
    private logger: ILogger,
    private maxWorkers: number = 2
  ) { }

  async handle(
    tools: ToolCall[],
    _agent: AIAgentRequest,
    signal: AbortSignal,
  ): Promise<string> {
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
          };
        }
      })
    );

    const results = await Promise.all(promises);

    this.logger.info('Tools completed', { count: results.length });

    return results
      .map((r) =>
        r.success
          ? `Tool: ${r.toolName}, Success: ${r.success}, Result: ${r.result}`
          : `Tool: ${r.toolName}, Success: ${r.success}, Error: ${r.error}`
      )
      .join('\n');
  }

  async executeTool(logger: ILogger, toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;
    logger.info(`Executing tool: ${name} with arguments: ${JSON.stringify(args)}`);

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

export { ToolsQueue };