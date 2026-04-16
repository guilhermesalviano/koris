import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { config } from '../../../config';
import { buildSkillLearningPrompt, buildSkillResponsePrompt } from '../../../utils/prompt';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { IMessageService } from '../../message-service';
import { isSkillAlreadyLearned } from '../../../utils/history';

const MAX_TOOL_ITERATIONS = 10;

/**
 * Process AI messages with iterative tool call handling.
 * Continues executing tools until AI returns a final response without tool calls.
 * Sends progress summaries via onProgress callback.
 * Optimizes skill execution: doesn't loop after successful skill execution.
 * Stores all interactions in database for audit trail and analytics.
 */
async function AIiteration(
  logger: ILogger,
  userMessage: string,
  channel: string,
  message: IMessageService,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const toolsQueue = new ToolsQueue(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress;
  
  let iteration = 1;
  let processStatus: string | undefined = undefined;
  let currentMessage = userMessage;
  let isSkillExecution = false;

  while (iteration < MAX_TOOL_ITERATIONS) {
    logger.info(`AI iteration ${iteration}`, { channel });

    if (onProgress && processStatus) {
      onProgress(`${processStatus || 'Processing'} (iteration ${iteration}/${MAX_TOOL_ITERATIONS})...`);
    }

    const messageHistory = message.getHistory();
    
    const aiResponse = await messageProvider(
      logger,
      currentMessage,
      channel,
      options,
      messageHistory
    );

    const responseText = typeof aiResponse === 'string' 
      ? aiResponse 
      : JSON.stringify(aiResponse);

    const toolCalls = extractToolCalls(responseText);

    if (toolCalls.length === 0) {
      logger.info('AI returned final response (no tool calls)', { channel });
      message.save({
        role: 'assistant',
        content: responseText,
      });
      return responseText;
    }

    const filteredToolCalls = toolCalls.filter(toolCall => {
      if (toolCall.name === 'get_skill') {
        logger.info(`Checking if skill is already learned to optimize execution ${toolCall.name}`, { messageHistory });

        if (toolCall.name && isSkillAlreadyLearned(toolCall.name, messageHistory)) {
          logger.info(`Skill "${toolCall.name}" already in history, skipping get_skill`, { channel });
          if (onProgress) {
            onProgress(`Skill "${toolCall.name}" already learned, using cached content...`);
          }
          return false;
        }
      }
      return true;
    });
    
    logger.info(`Executing tool call(s)`, { toolNames: filteredToolCalls.map(t => t.name), toolCalls: toolCalls.map(t => t.arguments)  });

    if (onProgress) {
      onProgress(`Executing tool(s): ${filteredToolCalls.map(t => t.name).join(', ')}`);
    }
    
    let toolResults: string = '';
    if (filteredToolCalls.length > 0) {
      toolResults = await toolsQueue.handle(
        filteredToolCalls,
        { model: config.AI.MODEL },
        signal
      );
    }

    if (filteredToolCalls.some(t => t.name === 'get_skill')) {
      logger.info('Learning skill content', { channel });

      isSkillExecution = true;
      processStatus = 'Learning skill content';
      currentMessage = buildSkillLearningPrompt(toolResults, userMessage);

      options = { ...options, toolsEnabled: true };
    } else if (isSkillExecution && filteredToolCalls.some(t => ['curl_request', 'execute_command'].includes(t.name))) {
      processStatus = 'Skill executed. Extracting response...';
      currentMessage = buildSkillResponsePrompt(toolResults);

      return toolResults;
    } else {
      logger.info('tool results', { toolResults });
      // processStatus = 'Processing tool results...';
      // currentMessage = buildToolResultPrompt(responseText, toolResults);
      return toolResults;
    }
    // save knowledge from tool execution in message history
    message.save({ role: 'system', content: currentMessage });
    iteration++;
  }

  logger.warn('Max tool iterations reached', { 
    channel,
    maxIterations: MAX_TOOL_ITERATIONS 
  });
  
  if (onProgress) {
    onProgress('⚠️ Max iterations reached');
  }

  const finalMessage = 'Maximum tool execution iterations reached. Please try rephrasing your request.';

  message.save({ role: 'assistant', content: finalMessage });
  
  return finalMessage;
}

export { AIiteration };