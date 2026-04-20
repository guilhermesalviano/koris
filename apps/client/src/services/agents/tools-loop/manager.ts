import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { IMessageService } from '../../message-service';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';

/**
 * Tools Loop Manager
 * 
 * Orchestrates the skill learning and execution flow:
 * 1. Get initial AI response with tool calls
 * 2. Filter out get_skill calls for learning phase
 * 3. Execute learning phase (learner-worker) to learn skills
 * 4. Execute execution phase (executor-worker) to use learned skills
 * 
 * The database stores learned skills for reuse across sessions:
 * - Learning context: prompt used to teach the skill
 * - Execution context: prompt and results from actual usage
 * - Metadata: execution count, timestamps, etc.
 */
async function toolsLoop(
  logger: ILogger,
  userMessage: string,
  channel: string,
  message: IMessageService,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const toolsQueue = new ToolsQueue(logger);
  const signal = options?.signal || new AbortController().signal;
  const onProgress = options?.onProgress || ((text) => logger.info(text));

  const messageHistory = message.getHistory();

  const aiResponse = await messageProvider(
    logger,
    userMessage,
    channel,
    options,
    messageHistory
  );

  const responseText = normalizeResponse(aiResponse);
  const callbacks = extractToolCalls(responseText);

  if (callbacks.length === 0) return responseText;

  const toolsToLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toolsToExecute = callbacks.filter(cb => cb.name !== 'get_skill');
  
  if (toolsToLearn.length > 0) {
    onProgress(`📚 Learning phase`);
    onProgress(`Learning phase: ${toolsToLearn.length} skill(s) to learn`);
    const learnerResponse = await learnerWorker(
      toolsToLearn,
      userMessage,
      messageHistory,
      logger,
      channel,
      toolsQueue,
      signal,
      onProgress,
      options,
    );
    const newTools = extractToolCalls(learnerResponse);
    onProgress(`New tools after learning phase: ${JSON.stringify(newTools)}`);
    const combinedTools = [...toolsToExecute, ...newTools];

    toolsToExecute = combinedTools;
  }

  if (toolsToExecute.length === 0) {
    onProgress('✓ All tools processed');
    return responseText;
  }

  onProgress(`⚙️ Execution phase, ${toolsToExecute.length} tool(s) to execute`);
  const finalResponse = await executorWorker(
    toolsToExecute,
    messageHistory,
    logger,
    channel,
    message,
    toolsQueue,
    signal,
    onProgress,
    options,
    userMessage
  );

  return finalResponse;
}

export { toolsLoop };