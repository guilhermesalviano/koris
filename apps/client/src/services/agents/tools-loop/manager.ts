import { messageProvider } from '../chat/message-provider';
import { messageProviderStream } from '../chat/message-provider-stream';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';
import { TOOL_CALL_HELPER } from '../../../constants';
import { LoopContext } from './context';
import type { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import type { IMessageService } from '../../message-service';
import type { ILogger } from '../../../infrastructure/logger';

async function streamResponse(
  logger: ILogger,
  userMessage: string,
  channel: string,
  options: ProcessOptions | undefined,
  messageHistory: import('../../../entities/message').Message[]
): Promise<ProcessedMessage> {
  const r = await messageProviderStream(logger, userMessage, channel, options, messageHistory);
  // ToolCall[] is unexpected here; normalize it to a string so callers always get string | AsyncGenerator.
  if (Array.isArray(r)) return normalizeResponse(r);
  return r as ProcessedMessage;
}

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
    onProgress: options?.onProgress ?? ((progress) => logger.info(progress)),
    options,
  };

  /**
   * Todo:
   * if AI Learn how to use weather and asked about a "Cat fact", it doesn't
   * recognize "get skill" to learn
   */

  const messageHistory = message.getHistory();

  // Non-streaming call to detect tool calls.
  const aiResponse = await messageProvider(logger, TOOL_CALL_HELPER + userMessage, channel, options, messageHistory);
  const responseText = normalizeResponse(aiResponse);
  let callbacks = extractToolCalls(responseText);

  // No tool calls — stream the response directly.
  if (callbacks.length === 0) {
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

  if (toLearn.length > 0) {
    ctx.onProgress(` Learning phase: ${toLearn.length} skill(s)`);
    const learned = await learnerWorker(toLearn, userMessage, messageHistory, ctx);
    toExecute = [...toExecute, ...extractToolCalls(learned)];
  }

  if (toExecute.length === 0) {
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  ctx.onProgress(` Execution phase: ${toExecute.length} tool(s)`);
  return executorWorker(toExecute, messageHistory, ctx.logger, ctx.channel, ctx.message, ctx.toolsQueue, ctx.signal, ctx.onProgress, ctx.options, userMessage);
}

export { toolsLoop };
