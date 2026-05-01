import { extractToolCalls, normalizeResponse } from "../../utils/tool-calls";
import { config } from "../../config";
import { TOOLS_RESULT_PROMPT } from "../../constants";
import { replacePlaceholders } from "../../utils/prompt";
import { messageProvider } from "../chat/message-provider";
import type { ToolCall } from "../../types/tools";
import type { LoopContext } from "../../types/context";
import type { ProcessedMessage } from "../../types/agents";
import type { Message } from "../../entities/message";

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

  ctx.logger.info(`Executing tools (${toolCalls})...`);

  const toolResultsArray = await ctx.toolsQueue.handle(
    toolCalls,
    { model: config.AI.MODEL },
    ctx.signal
  );

  const toolResults = toolResultsArray
    .map((r) =>
      r.success
        ? `Tool: ${r.toolName}, Result: ${r.result}`
        : `Tool: ${r.toolName}, Success: ${r.success}, Error: ${r.error}`
    )
    .join('\n');
  ctx.logger.info(`Tool results: ${JSON.stringify(toolCalls)}`);

  const synthesisPrompt = replacePlaceholders(TOOLS_RESULT_PROMPT, { v1: userMessage, v2: toolResults });
  const response = await messageProvider(
    ctx.logger,
    synthesisPrompt,
    ctx.channel,
    ctx.options,
    messageHistory
  );

  const normalizedResponse = normalizeResponse(response);
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