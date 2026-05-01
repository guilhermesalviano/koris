import { messageProvider } from '../chat/message-provider';
import { messageProviderStream } from '../chat/message-provider-stream';
import { extractToolCalls, normalizeResponse } from '../../utils/tool-calls';
import { ToolsQueue } from '../tools-queue';
import { executorWorker } from './executor-worker';
import { learnerWorker } from './learner-worker';
import { FIRST_PROMPT_HELPER, SKILL_READY_PROMPT } from '../../constants';
import { THINK_START, THINK_END, RESPONSE_ANCHOR } from '../../constants/thinking';
import { replacePlaceholders } from '../../utils/prompt';
import type { ProcessedMessage, ProcessOptions } from '../../types/agents';
import type { IMessageService } from '../message-service';
import type { ILogger } from '../../infrastructure/logger';
import type { LoopContext } from '../../types/context';
import type { ToolCall } from '../../types/tools';
import type { Message } from '../../entities/message';

function isAsyncGen(val: unknown): val is AsyncGenerator<string> {
  return typeof val === 'object' && val !== null && Symbol.asyncIterator in val;
}

/**
 * Shared tool-call dispatch: handles skill learning then tool execution.
 * Used by both the sync (non-TUI) and streaming (TUI) paths.
 * Returns a string result suitable for yielding or returning directly.
 */
async function dispatchToolCalls(
  callbacks: ToolCall[],
  userMessage: string,
  messageHistory: Message[],
  ctx: LoopContext,
): Promise<ProcessedMessage> {
  const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
  let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

  if (toLearn.length > 0) {
    ctx.onProgress(`Learning phase: ${toLearn.length} skill(s) - ${toLearn.map(c => c.name).join(' - ')}`);
    await learnerWorker(toLearn, userMessage, messageHistory, ctx);

    const skillPrompt = replacePlaceholders(SKILL_READY_PROMPT, { v1: userMessage });
    const aiResponse = await messageProvider(ctx.logger, skillPrompt, ctx.channel, ctx.options, ctx.message.getHistory());
    const responseText = normalizeResponse(aiResponse);
    toExecute = extractToolCalls(responseText);

    // Model answered directly from skill knowledge — no tool calls needed.
    if (toExecute.length === 0) return responseText;
  }

  if (toExecute.length === 0) {
    ctx.onProgress('No tools to execute');
    return '';
  }

  ctx.onProgress(`Execution phase: ${toExecute.length} tool(s) - ${toExecute.map(c => c.name).join(' - ')}`);
  return executorWorker(toExecute, userMessage, messageHistory, ctx);
}

/**
 * Streaming dispatch: streams thinking in real-time while buffering content
 * to decide whether the model is answering directly (text) or using tools.
 *
 * Thinking (THINK_START…THINK_END) is always yielded immediately.
 * Content peek:
 *   - starts with '{' → likely tool-call JSON → buffer, then dispatch
 *   - anything else   → text response → yield immediately, continue streaming
 */
async function* streamingDispatch(
  gen: AsyncGenerator<string>,
  userMessage: string,
  messageHistory: Message[],
  ctx: LoopContext,
): AsyncGenerator<string> {
  let inThinking = false;
  let pastThinking = false;
  const contentBuffer: string[] = [];
  let streamingText = false;

  for await (const chunk of gen) {
    // Thinking phase: always yield immediately for real-time display.
    if (chunk === THINK_START) { inThinking = true; yield chunk; continue; }
    if (chunk === THINK_END)   { inThinking = false; pastThinking = true; yield chunk; continue; }
    if (inThinking) { yield chunk; continue; }

    // First content chunk without a prior thinking block.
    if (!pastThinking) pastThinking = true;

    // Text already decided: stream directly.
    if (streamingText) { yield chunk; continue; }

    contentBuffer.push(chunk);

    // Peek at accumulated content to decide text vs tool calls.
    const accumulated = contentBuffer.join('').trimStart();
    if (accumulated.length > 0 && !accumulated.startsWith('{')) {
      // Looks like prose — flush buffer and continue streaming.
      streamingText = true;
      for (const b of contentBuffer) yield b;
      contentBuffer.length = 0;
    }
  }

  // Stream finished.
  if (streamingText) return;

  // Buffered content might be tool calls.
  const fullContent = contentBuffer.join('');
  if (!fullContent.trim()) return;

  const callbacks = extractToolCalls(fullContent);
  if (callbacks.length === 0) {
    // Wasn't a tool call after all (e.g. text starting with '{') — yield as-is.
    yield* contentBuffer;
    return;
  }

  const result = await dispatchToolCalls(callbacks, userMessage, messageHistory, ctx);
  if (typeof result === 'string') {
    if (result.trim()) { yield RESPONSE_ANCHOR; yield result; }
    return;
  }
  if (isAsyncGen(result)) { yield RESPONSE_ANCHOR; yield* result; return; }
}

async function manager(
  logger: ILogger,
  userMessage: string,
  channel: string,
  message: IMessageService,
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const messageHistory = message.getHistory();

  const ctx: LoopContext = {
    logger,
    channel,
    message,
    toolsQueue: new ToolsQueue(logger),
    signal: options?.signal ?? new AbortController().signal,
    onProgress: options?.onProgress ?? ((progress) => logger.info(progress)),
    options,
  };

  const prompt = replacePlaceholders(FIRST_PROMPT_HELPER, { v1: userMessage });
  const streamResult = await messageProviderStream(logger, prompt, channel, options, messageHistory);

  // Non-streaming path (Telegram, Web, non-Ollama).
  if (!isAsyncGen(streamResult)) {
    const responseText = normalizeResponse(streamResult);
    const callbacks = extractToolCalls(responseText);
    if (callbacks.length === 0) return responseText;
    return dispatchToolCalls(callbacks, userMessage, messageHistory, ctx);
  }

  // Streaming path (TUI+Ollama): stream thinking, detect and dispatch.
  return streamingDispatch(streamResult, userMessage, messageHistory, ctx);
}

export { manager };
