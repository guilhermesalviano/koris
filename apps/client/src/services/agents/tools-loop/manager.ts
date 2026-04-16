import { ILogger } from '../../../infrastructure/logger';
import { messageProvider } from '../chat/message-provider';
import { extractToolCalls, normalizeResponse } from '../../../utils/tool-calls';
import { ToolsQueue } from '../../tools-queue';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { IMessageService } from '../../message-service';
import { executeToolsIteratively } from './worker';

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
  const toolCalls = extractToolCalls(responseText);

  if (toolCalls.length === 0) {
    return responseText;
  }

  const finalResponse = await executeToolsIteratively(
    toolCalls,
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