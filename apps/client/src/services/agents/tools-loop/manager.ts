import { messageProvider } from '../chat/message-provider';
import { messageProviderStream } from '../chat/message-provider-stream';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';
import { FIRST_PROMPT_HELPER, SKILL_READY_PROMPT } from '../../../constants';
import { replacePlaceholders } from '../../../utils/prompt';
import type { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import type { IMessageService } from '../../message-service';
import type { ILogger } from '../../../infrastructure/logger';
import type { LoopContext } from './context';

async function streamResponse(
  logger: ILogger,
  userMessage: string,
  channel: string,
  options: ProcessOptions | undefined,
  messageHistory: import('../../../entities/message').Message[]
): Promise<ProcessedMessage> {
  const r = await messageProviderStream(logger, userMessage, channel, options, messageHistory);
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

  const messageHistory = message.getHistory();
  const prompt = replacePlaceholders(FIRST_PROMPT_HELPER, { v1: userMessage });

  const aiResponse = await messageProvider(logger, prompt, channel, options, messageHistory);
  const responseText = normalizeResponse(aiResponse);
  let callbacks = extractToolCalls(responseText);

  if (callbacks.length === 0) {
    ctx.onProgress('No tools to execute, streaming final response');
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

  if (toLearn.length > 0) {
    ctx.onProgress(`Learning phase: ${toLearn.length} skill(s) - ${toLearn.map(c => c.name).join(' - ')}`);
    await learnerWorker(toLearn, userMessage, messageHistory, ctx);

    const skillPrompt = replacePlaceholders(SKILL_READY_PROMPT, { v1: userMessage });
    const aiResponse = await messageProvider(logger, skillPrompt, channel, options, message.getHistory());

    const responseText = normalizeResponse(aiResponse);
    toExecute = extractToolCalls(responseText);
  }

  if (toExecute.length === 0) {
    ctx.onProgress('No tools to execute, streaming final response');
    return streamResponse(logger, userMessage, channel, options, messageHistory);
  }

  ctx.onProgress(`Execution phase: ${toExecute.length} tool(s) - ${toExecute.map(c => c.name).join(' - ')}`);

  return executorWorker(toExecute, userMessage, messageHistory, ctx);
}

export { manager };
