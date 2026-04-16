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
  iteration: number = 0,
  maxIterations: number = 10
): Promise<string> {
  if (iteration >= maxIterations) {
    logger.warn('Max tool iterations reached', { 
      maxIterations,
      userMessage
    });
    return `Maximum tool execution iterations (${maxIterations}) reached. Please try rephrasing your request.`;
  }

  let accumulatedContext = '';

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];

    if (!toolCall || shouldSkipToolCall(toolCall, messageHistory)) {
      continue;
    }

    onProgress(`Executing tool call: ${toolCall.name}`);

    const toolResults = await toolsQueue.handle(
      [toolCall],
      { model: config.AI.MODEL },
      signal
    );

    if (toolCall.name === 'get_skill') {
      onProgress('Learning skill content... ');
      accumulatedContext += buildSkillLearningPrompt(toolResults, userMessage);
    } else {
      accumulatedContext += buildSkillResponsePrompt(toolResults);
    }
  }

  message.save({ role: 'system', content: accumulatedContext });

  logger.info('Tool calls executed, generating response', { 
    iteration,
    accumulatedContext 
  });

  const finalResponse = await messageProvider(
    logger,
    accumulatedContext,
    channel,
    options,
    messageHistory
  );

  const normalizedResponse = normalizeResponse(finalResponse);
  const newToolCalls = extractToolCalls(normalizedResponse);

  if (newToolCalls.length === 0) {
    logger.info('AI returned final response (no more tool calls)', { 
      iteration,
      channel 
    });
    return normalizedResponse;
  }

  logger.info('AI response contains more tool calls, looping again', { 
    iteration,
    toolCallCount: newToolCalls.length
  });

  // Save the AI's response that contains tool calls
  message.save({ role: 'assistant', content: normalizedResponse });

  // Recursively execute the new tool calls
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