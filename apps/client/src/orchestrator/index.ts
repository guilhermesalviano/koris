import { ILogger } from "../infrastructure/logger";
import { WorkerManager } from "./worker-manager";
import { executeTool, type ToolCall } from "./worker/executor";

interface AIChatRequest {
  model?: string;
}

class Orchestrator {
  private workerManager: WorkerManager<any>;

  constructor(
    private logger: ILogger,
    maxWorkers: number = 3
  ) {
    this.workerManager = new WorkerManager(maxWorkers, logger);
  }

  async handleToolCalls(
    toolCalls: ToolCall[],
    _request: AIChatRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const tasks = toolCalls.map((toolCall, index) => ({
      id: `tool-${index}-${toolCall.name}`,
      execute: () => executeTool(this.logger, toolCall),
      // priority: toolCall.priority,
    }));

    const results = await this.workerManager.execute(tasks, signal);

    this.logger.info('Tool calls completed', { count: results.length });

    const toolResults = results
      .map(
        (r) =>
          `Tool: ${r.toolName}\nSuccess: ${r.success}\n${r.success ? `Result:\n${r.result}` : `Error: ${r.error}`}`,
      )
      .join('\n\n');

    return `I executed the following tools:\n\n${toolResults}`;
  }
}

export { Orchestrator };