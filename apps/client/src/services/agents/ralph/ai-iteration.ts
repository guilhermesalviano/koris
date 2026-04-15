import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls } from '../../../utils/tool-calls';
import { ToolsOrchestrator } from '../../tools-orchestrator';
import { config } from '../../../config';
import { buildSkillLearningPrompt, buildSkillResponsePrompt, buildToolResultPrompt } from '../../../utils/prompt';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { IMessageService } from '../../message';

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
  const toolsOrchestrator = new ToolsOrchestrator(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress;

  message.save({ role: 'user', content: userMessage });
  
  let processStatus: string | undefined = undefined;
  let currentMessage = userMessage;
  let iteration = 0;
  let isSkillExecution = false;

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    
    logger.info(`AI iteration ${iteration}`, { channel });
    
    if (onProgress && processStatus) {
      onProgress(`${processStatus || 'Processing'} (iteration ${iteration}/${MAX_TOOL_ITERATIONS})...`);
    }

    const aiResponse = await messageProvider(
      logger,
      currentMessage,
      channel,
      options
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

    logger.info(`Executing tool call(s)`, { channel, iteration });
    
    if (onProgress) {
      onProgress(`Executing tool(s): ${toolCalls.map(t => t.name).join(', ')}`);
    }
    
    const toolResults = await toolsOrchestrator.handle(
      toolCalls,
      { model: config.AI.MODEL },
      signal
    );

    // Special handling for skill learning
    if (toolCalls.some(t => t.name === 'get_skill')) {
      logger.info('Learning skill content', { channel });
      processStatus = 'Learning skill content';
      currentMessage = buildSkillLearningPrompt(toolResults, userMessage);
      options = { ...options, toolsEnabled: true };
      isSkillExecution = true;
    } 
    // If we're in skill execution and just executed a tool
    else if (isSkillExecution && toolCalls.some(t => ['curl_request', 'execute_command'].includes(t.name))) {
      logger.info('Skill execution complete, returning result', { channel });
      processStatus = 'Skill executed. Extracting response...';
      currentMessage = buildSkillResponsePrompt(userMessage, toolResults);
    }
    else {
      logger.info('Continuing AI processing with tool results', { channel });
      if (onProgress) {
        onProgress(`Processing tool results (${toolResults.length} chars)...`);
      }
      currentMessage = buildToolResultPrompt(responseText, toolResults);
    }
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