import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { IMessageService } from '../../message-service';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';
import { TOOL_CALL_HELPER } from '../../../constants';
import { LoopContext } from '../../../types/tools';

async function toolsLoop(
  logger: ILogger,
  userMessage: string,
  channel: string,
  message: IMessageService,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const ctx: LoopContext = {
    logger,
    channel,
    message,
    toolsQueue: new ToolsQueue(logger),
    signal: options?.signal ?? new AbortController().signal,
    onProgress: options?.onProgress ?? (() => {}),
    options,
  };

  const messageHistory = message.getHistory();
  const aiResponse = await messageProvider(logger, TOOL_CALL_HELPER + userMessage, channel, options, messageHistory);
  const responseText = normalizeResponse(aiResponse);

  let callbacks = extractToolCalls(responseText);
  if (callbacks.length === 0) return responseText;

  const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

  if (toLearn.length > 0) {
    ctx.onProgress(`📚 Learning phase: ${toLearn.length} skill(s)`);
    const learned = await learnerWorker(toLearn, userMessage, messageHistory, ctx);
    toExecute = [...toExecute, ...extractToolCalls(learned)];
  }

  if (toExecute.length === 0) return responseText;

  ctx.onProgress(`⚙️ Execution phase: ${toExecute.length} tool(s)`);
  return executorWorker(toExecute, messageHistory, ctx.logger, ctx.channel, ctx.message, ctx.toolsQueue, ctx.signal, ctx.onProgress, ctx.options, userMessage);
}

export { toolsLoop };