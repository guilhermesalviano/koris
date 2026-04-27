import { extractToolCalls, normalizeResponse } from "../../../utils/tool-calls";
import { messageProviderStream } from "../chat/message-provider-stream";
import { config } from "../../../config";
import { TOOLS_RESULT_PROMPT } from "../../../constants";
import { replacePlaceholders } from "../../../utils/prompt";
import type { ToolCall } from "../../../types/tools";
import type { ProcessedMessage } from "../../../types/agents";
import type { Message } from "../../../entities/message";
import type { LoopContext } from "./context";

async function executorWorker(
  toolCalls: ToolCall[],
  userMessage: string,
  messageHistory: Message[],
  ctx: LoopContext,
  iteration: number = 1,
  maxIterations: number = 10
): Promise<ProcessedMessage> {
  if (iteration >= maxIterations) {
    ctx.logger.warn('Max tool iterations reached', { 
      maxIterations,
      userMessage
    });
    return `Maximum tool execution iterations (${maxIterations})`+
      ` reached. Please try rephrasing your request.`;
  }
  ctx.onProgress(`Iteration ${iteration}`);

  ctx.logger.info(`Executing tools (${JSON.stringify(toolCalls)})...`);

  const toolResults = await ctx.toolsQueue.handle(
    toolCalls,
    { model: config.AI.MODEL },
    ctx.signal
  );

  ctx.logger.info(`Tool results: ${JSON.stringify(toolResults)}`);

  const synthesisPrompt = replacePlaceholders(TOOLS_RESULT_PROMPT, { v1: userMessage, v2: toolResults });
  const response = await messageProviderStream(
    ctx.logger,
    synthesisPrompt,
    ctx.channel,
    ctx.options,
    messageHistory
  );

  // Stream = final answer (tui+ollama). Can't inspect for more tool calls — return directly. typeof response !== 'string'
  if (!Array.isArray(response)) return response as ProcessedMessage;

  const normalizedResponse = Array.isArray(response)
    ? normalizeResponse({
        tool_calls: response.map((toolCall) => ({
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      })
    : normalizeResponse(response);
  const nextToolCalls = extractToolCalls(normalizedResponse, ctx.logger);

  if (nextToolCalls.length === 0) return normalizedResponse;

  ctx.logger.info(`Tool call (${nextToolCalls.length}) after execution phase: ${JSON.stringify(nextToolCalls)}`);

  return executorWorker(
    nextToolCalls,
    userMessage,
    messageHistory,
    ctx,
    iteration + 1,
    maxIterations
  );
}

export { executorWorker };