import pLimit from "p-limit";
import { ILogger } from "../../infrastructure/logger";
import { executeTool, type ToolCall } from "./worker/executor";

interface AIChatRequest {
  model?: string;
}

class Orchestrator {
  private maxWorkers: number;

  constructor(
    private logger: ILogger,
    maxWorkers: number = 2
  ) {
    this.maxWorkers = maxWorkers;
  }

  async handle(
    tools: ToolCall[],
    _request: AIChatRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const limit = pLimit(this.maxWorkers);

    const promises = tools.map((tool) =>
      limit(async () => {
        if (signal.aborted) {
          throw new Error('Tool execution aborted');
        }

        try {
          return await executeTool(this.logger, tool);
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

    const output = results
      .map(
        (r) =>
          `Tool: ${r.toolName}\nSuccess: ${r.success}\n` +
          `${r.success ? `Result:\n${r.result}` : `Error: ${r.error}`}`,
      )
      .join('\n\n');

    return output;
  }
}

export { Orchestrator };