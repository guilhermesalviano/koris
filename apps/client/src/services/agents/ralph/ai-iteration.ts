import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls } from '../../../utils/tool-calls';
import { ToolsOrchestrator } from '../../tools-orchestrator';
import { config } from '../../../config';
import { buildSkillLearningPrompt, buildSkillResponsePrompt, buildToolResultPrompt } from '../../../utils/prompt';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { randomUUID } from 'node:crypto';
import { Session } from '../../../entities/session';
import { Message } from '../../../entities/message';

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
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const sessionId = options?.sessionId || randomUUID();
  const toolsOrchestrator = new ToolsOrchestrator(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress;
  
  // Ensure session exists
  if (!options?.sessionId) {
    try {
      const session = new Session({
        id: sessionId,
        source: channel,
        startedAt: Date.now(),
        endedAt: 0,
        messageCount: 0,
        metadata: { initiated: new Date().toISOString() },
      });
      options?.sessionRepo?.save(session);
    } catch (error) {
      logger.error('Failed to create session', { error, sessionId });
    }
  }

  // Store user message
  const userMessageId = randomUUID();
  try {
    const userMsg = new Message({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
      tool_calls: [],
      tool_results: []
    });
    options?.messageRepo?.save(userMsg);
  } catch (error) {
    logger.error('Failed to store user message', { error, sessionId });
  }
  
  let processStatus: string | undefined = undefined;
  let currentMessage = userMessage;
  let iteration = 0;
  let isSkillExecution = false;
  let assistantMessageId = randomUUID();

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;
    
    logger.info(`AI iteration ${iteration}`, { channel, sessionId });
    
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
      logger.info('AI returned final response (no tool calls)', { channel, sessionId });
      try {
        const assistantMsg = new Message({
          id: assistantMessageId,
          sessionId,
          role: 'assistant',
          content: responseText,
          created_at: new Date().toISOString(),
          tool_calls: [],
          tool_results: []
        });
        options?.messageRepo?.save(assistantMsg);
        options?.sessionRepo?.update(sessionId, { messageCount: 2 });
      } catch (error) {
        logger.error('Failed to update message count', { error, sessionId });
      }
      return responseText;
    }

    logger.info(`Executing tool call(s)`, { channel, iteration, sessionId });
    
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
      logger.info('Learning skill content', { channel, sessionId });
      processStatus = 'Learning skill content';
      currentMessage = buildSkillLearningPrompt(toolResults, userMessage);
      options = { ...options, toolsEnabled: true };
      isSkillExecution = true;
    } 
    // If we're in skill execution and just executed a tool
    else if (isSkillExecution && toolCalls.some(t => ['curl_request', 'execute_command'].includes(t.name))) {
      logger.info('Skill execution complete, returning result', { channel, sessionId });
      processStatus = 'Skill executed. Extracting response...';
      currentMessage = buildSkillResponsePrompt(userMessage, toolResults);
    }
    else {
      logger.info('Continuing AI processing with tool results', { channel, sessionId });
      if (onProgress) {
        onProgress(`Processing tool results (${toolResults.length} chars)...`);
      }
      currentMessage = buildToolResultPrompt(responseText, toolResults);
    }

    assistantMessageId = randomUUID();
  }

  logger.warn('Max tool iterations reached', { 
    channel,
    sessionId,
    maxIterations: MAX_TOOL_ITERATIONS 
  });
  
  if (onProgress) {
    onProgress('⚠️ Max iterations reached');
  }

  const finalMessage = 'Maximum tool execution iterations reached. Please try rephrasing your request.';
  try {
    const assistantMsg = new Message({
      id: assistantMessageId,
      sessionId,
      role: 'assistant',
      content: finalMessage,
      created_at: new Date().toISOString(),
      tool_calls: [],
      tool_results: []
    });
    options?.messageRepo?.save(assistantMsg);
    options?.sessionRepo?.update(sessionId, { messageCount: 4 });
  } catch (error) {
    logger.error('Failed to store final message', { error, sessionId });
  }
  
  return finalMessage;
}

export { AIiteration };