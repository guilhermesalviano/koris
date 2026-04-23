import { messageProvider } from '../chat/message-provider';
import { messageProviderStream } from '../chat/message-provider-stream';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';
import { FIRST_PROMPT_HELPER } from '../../../constants';
import { LoopContext } from './context';
import type { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import type { IMessageService } from '../../message-service';
import type { ILogger } from '../../../infrastructure/logger';
import { replacePlaceholders } from '../../../utils/prompt';

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

async function manager(
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
   * Todo - bug:
   * - tools execution is not calling after learning phase
   * - don't recognize multiple questions in the same prompt
   */
  const messageHistory = message.getHistory();
  const prompt = replacePlaceholders(FIRST_PROMPT_HELPER, { v1: userMessage });

  const aiResponse = await messageProvider(logger, prompt, channel, options, messageHistory);
  const responseText = normalizeResponse(aiResponse);
  let callbacks = extractToolCalls(responseText);

  if (callbacks.length === 0) {
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

  if (toLearn.length > 0) {
    ctx.onProgress(`Learning phase: ${toLearn.length} skill(s)`);
    const learned = await learnerWorker(toLearn, userMessage, messageHistory, ctx);
    
    const newCalls = extractToolCalls(learned);

    const uniqueNewCalls = newCalls.filter(newCall => 
      !toExecute.some(existing => 
        existing.name === newCall.name && 
        JSON.stringify(existing.arguments) === JSON.stringify(newCall.arguments)
      )
    );

    toExecute = [...toExecute, ...uniqueNewCalls];
  }

  if (toExecute.length === 0) {
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  ctx.onProgress(`Execution phase: ${toExecute.length} tool(s) - ${toExecute.map(c => c.arguments.url).join('; ')}`);
  return executorWorker(toExecute, messageHistory, ctx.logger, ctx.channel, ctx.message, ctx.toolsQueue, ctx.signal, ctx.onProgress, ctx.options, userMessage);
}

export { manager };
