import { ILogger } from "../../../infrastructure/logger";
import { buildSkillLearningPrompt, buildSkillResponsePrompt } from "../../../utils/prompt";
import { extractToolCalls, normalizeResponse, shouldSkipToolCall } from "../../../utils/tool-calls";
import { config } from "../../../config";
import { ProcessOptions } from "../../../types/agents";
import { Message } from "../../../entities/message";
import { ToolCall } from "../../../types/tools";
import { IMessageService } from "../../message-service";
import { ToolsQueue } from "../../tools-queue";
import { messageProvider } from "../chat/message-provider";

async function executeToolsIteratively(
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

  const toolsToExecute = toolCalls.filter(toolCall => 
    toolCall && !shouldSkipToolCall(toolCall, messageHistory, logger)
  );

  onProgress(`Tools to execute in this iteration(${iteration}/${maxIterations}): ` + 
    (toolsToExecute.length > 0 ? toolsToExecute.map(t => t.name).join(', ') : "None"));

  let accumulatedContext = "";
  if (toolsToExecute.length > 0) {
    const toolResults = await toolsQueue.handle(
      toolsToExecute,
      { model: config.AI.MODEL },
      signal
    );

    for (const toolCall of toolsToExecute) {
      if (toolCall.name === 'get_skill') {
        accumulatedContext += buildSkillLearningPrompt(toolResults, userMessage);
      } else {
        accumulatedContext += buildSkillResponsePrompt(toolCall, toolResults);
      }
    }
  }
  message.save({ role: 'system', content: accumulatedContext });

  const response = await messageProvider(
    logger,
    accumulatedContext,
    channel,
    options,
    messageHistory
  );

  logger.info("AI Response: ", { response })

  const normalizedResponse = normalizeResponse(response);
  const newToolCalls = extractToolCalls(normalizedResponse);

  if (newToolCalls.length === 0) {
    onProgress('AI returned final response (no more tool calls)');
    return normalizedResponse;
  }

  return executeToolsIteratively(
    newToolCalls,
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

export { executeToolsIteratively };