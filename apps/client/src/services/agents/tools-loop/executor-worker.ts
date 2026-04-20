import { ILogger } from "../../../infrastructure/logger";
import { extractToolCalls, normalizeResponse } from "../../../utils/tool-calls";
import { config } from "../../../config";
import { ProcessOptions } from "../../../types/agents";
import { Message } from "../../../entities/message";
import { ToolCall } from "../../../types/tools";
import { IMessageService } from "../../message-service";
import { ToolsQueue } from "../../tools-queue";
import { messageProvider } from "../chat/message-provider";
import { buildToolResultPrompt } from "../../../utils/prompt";

async function executorWorker(
  toolCalls: ToolCall[],
  messageHistory: Message[],
  logger: ILogger,
  channel: string,
  message: IMessageService,
  toolsQueue: ToolsQueue,
  signal: AbortSignal,
  onProgress: (text: string) => void,
  options: ProcessOptions | undefined,
  userMessage: string,
  iteration: number = 1,
  maxIterations: number = 10
): Promise<string> {
  if (iteration >= maxIterations) {
    logger.warn('Max tool iterations reached', { 
      maxIterations,
      userMessage
    });
    return `Maximum tool execution iterations (${maxIterations})`+
      ` reached. Please try rephrasing your request.`;
  }
  onProgress(`Iteration ${iteration}`);

  /**
   * bug to fix:
   * in one iteration, execute, send to AI results and
   * return to the user.
   */

  const toolResults = await toolsQueue.handle(
    toolCalls,
    { model: config.AI.MODEL },
    signal
  );

  const response = await messageProvider(
    logger,
    buildToolResultPrompt(userMessage, toolResults),
    channel,
    options,
    messageHistory,
    // [], // Test: Don't include full message history in subsequent iterations to avoid token overload - only the latest user message and tool results
  );

  const normalizedToolResults = normalizeResponse(response);
  const extractToolResults = extractToolCalls(normalizedToolResults);

  if (extractToolResults.length === 0) {
    onProgress('AI returned final response after skill learning');
    return normalizedToolResults;
  }
  onProgress(`Tool call (${extractToolResults.length}) after execution phase: ${JSON.stringify(extractToolResults)}`);

  return executorWorker(
    extractToolResults,
    message.getHistory(),
    logger,
    channel,
    message,
    toolsQueue,
    signal,
    onProgress,
    options,
    userMessage,
    iteration + 1,
    maxIterations
  );
}

export { executorWorker };