import { extractToolCalls, normalizeResponse } from "../../../utils/tool-calls";
import { ToolCall } from "../../../types/tools";
import { messageProvider } from "../chat/message-provider";
import { buildToolResultPrompt } from "../../../utils/prompt";
import { config } from "../../../config";
import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions } from "../../../types/agents";
import type { Message } from "../../../entities/message";
import type { IMessageService } from "../../message-service";
import type { IToolsQueue } from "../../tools-queue";

async function executorWorker(
  toolCalls: ToolCall[],
  messageHistory: Message[],
  logger: ILogger,
  channel: string,
  message: IMessageService,
  toolsQueue: IToolsQueue,
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
  );

  const normalizedToolResults = normalizeResponse(response);
  const extractToolResults = extractToolCalls(normalizedToolResults);

  if (extractToolResults.length === 0) {
    onProgress('AI returned final response');
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