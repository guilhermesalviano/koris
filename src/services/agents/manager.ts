
import { IToolsQueue, ToolsQueueFactory } from '../tools-queue';
import { ExecutorWorkerFactory } from '../workers/executor-worker';
import { LearnerWorkerFactory } from '../workers/learner-worker';
import { FIRST_PROMPT_HELPER, SKILL_READY_PROMPT } from '../../constants';
import { replacePlaceholders } from '../../utils/prompt';
import type { ProcessedMessage, ProcessOptions } from '../../types/agents';
import type { IMessageService } from '../message-service';
import type { ILogger } from '../../infrastructure/logger';
import type { Message } from '../../entities/message';
import type { IChatService } from '../../types/chat';
import type { LoopContext } from '../../types/context';
import type { ToolCall } from '../../types/tools';
import type { IWorker } from '../../types/workers';
import { ChatServiceFactory } from '../chat/chat-service';

interface ManagerArgs {
  userMessage: string;
  channel: string;
  message: IMessageService;
  options?: ProcessOptions;
}

interface IManager {
  name: string;
  run(args: ManagerArgs): Promise<ProcessedMessage>;
}

class Manager implements IManager {
  constructor(
    private logger: ILogger,
    public name: string,
    private toolsQueue: IToolsQueue,
    private ChatService: IChatService,
    private learner: IWorker,
    private executor: IWorker,
  ) { }

  async run(args: ManagerArgs): Promise<ProcessedMessage> {
    const { userMessage, channel, message, options } = args;
    const messageHistory = message.getHistory();

    const ctx: LoopContext = {
      channel,
      message,
      toolsQueue: this.toolsQueue,
      signal: options?.signal ?? new AbortController().signal,
      onProgress: options?.onProgress ?? ((progress) => this.logger.info(progress)),
      options,
    };

    const prompt = replacePlaceholders(FIRST_PROMPT_HELPER, { v1: userMessage });
    const sessionId = message.getSessionId();
    const response = await this.ChatService.complete(prompt, channel, options, messageHistory, sessionId);
    if (response.kind === 'message') return response.text;
    return this.dispatchToolCalls(response.calls, userMessage, messageHistory, ctx);
  }

  /**
   * Shared tool-call dispatch: handles skill learning then tool execution.
   * Used by both the sync (non-TUI) and streaming (TUI) paths.
   * Returns a string result suitable for yielding or returning directly.
   */
  private async dispatchToolCalls(
    callbacks: ToolCall[],
    userMessage: string,
    messageHistory: Message[],
    ctx: LoopContext,
  ): Promise<ProcessedMessage> {
    const toLearn = callbacks.filter(cb => cb.name === 'get_skill');
    let toExecute = callbacks.filter(cb => cb.name !== 'get_skill');

    if (toLearn.length > 0) {
      const skillNames = toLearn.map(c => c.arguments.skill_name ?? c.arguments.name ?? c.name).join(', ');
      ctx.onProgress(`Learning phase: ${toLearn.length} skill(s) - ${skillNames}`);
      await this.learner.run({ toolCalls: toLearn, userMessage, messageHistory, ctx });

      const skillPrompt = replacePlaceholders(SKILL_READY_PROMPT, { v1: userMessage });
      const sessionId = ctx.message.getSessionId();
      const response = await this.ChatService.complete(skillPrompt, ctx.channel, ctx.options, ctx.message.getHistory(), sessionId);
      if (response.kind === 'message') return response.text;
      toExecute = response.calls.filter(cb => cb.name !== 'get_skill');

      if (toExecute.length === 0) return '';
    }

    if (toExecute.length === 0) {
      ctx.onProgress('No tools to execute');
      return '';
    }

    ctx.onProgress(`Execution phase: ${toExecute.length} tool(s) - ${toExecute.map(c => c.name).join(' - ')}`);
    return this.executor.run({ toolCalls: toExecute, userMessage, messageHistory, ctx });
  }

}

class ManagerFactory {
  static create(logger: ILogger): IManager {
    const ChatService = ChatServiceFactory.create(logger, 'manager', 'manager');
    const toolsQueue = ToolsQueueFactory.create(logger);
    const learner = LearnerWorkerFactory.create(logger);
    const executor = ExecutorWorkerFactory.create(logger);
    return new Manager(logger, 'Manager', toolsQueue, ChatService, learner, executor);
  }
}

export { IManager, Manager, ManagerFactory };
