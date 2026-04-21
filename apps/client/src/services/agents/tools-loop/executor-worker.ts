import { extractToolCalls, normalizeResponse } from "../../../utils/tool-calls";
import { ToolCall } from "../../../types/tools";
import { messageProviderStream } from "../chat/message-provider-stream";
import { buildToolResultPrompt } from "../../../utils/prompt";
import { config } from "../../../config";
import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions, ProcessedMessage } from "../../../types/agents";
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
): Promise<ProcessedMessage> {
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

  const synthesisPrompt = buildToolResultPrompt(userMessage, toolResults);
  const response = await messageProviderStream(
    logger,
    synthesisPrompt,
    channel,
    options,
    messageHistory,
  );

  // Stream = final answer (tui+ollama). Can't inspect for more tool calls — return directly.
  if (typeof response !== 'string') return response as ProcessedMessage;

  const normalizedResponse = normalizeResponse(response);
  const nextToolCalls = extractToolCalls(normalizedResponse);

  if (nextToolCalls.length === 0) return normalizedResponse;

  onProgress(`Tool call (${nextToolCalls.length}) after execution phase: ${JSON.stringify(nextToolCalls)}`);

  return executorWorker(
    nextToolCalls,
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