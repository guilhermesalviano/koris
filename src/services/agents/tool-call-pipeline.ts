import { SKILL_READY_PROMPT, TOOL_GET_SKILL } from '../../constants';
import { replacePlaceholders } from '../../utils/prompt';
import type { ILogger } from '../../infrastructure/logger';
import type { Message } from '../../entities/message';
import type { IChatService } from '../../types/chat';
import type { LoopContext } from '../../types/context';
import type { ToolCall } from '../../types/tools';
import type { ProcessedMessage } from '../../types/agents';
import type { IWorker } from '../../types/workers';
import { ExecutorWorkerFactory, ExecutorWorkerArgs } from '../workers/executor-worker';
import { LearnerWorkerFactory, LearnerWorkerArgs } from '../workers/learner-worker';

interface IToolCallPipeline {
  execute(
    callbacks: ToolCall[],
    userMessage: string,
    messageHistory: Message[],
    ctx: LoopContext,
  ): Promise<ProcessedMessage>;
}

class ToolCallPipeline implements IToolCallPipeline {
  constructor(
    private ChatService: IChatService,
    private learner: IWorker<LearnerWorkerArgs, boolean>,
    private executor: IWorker<ExecutorWorkerArgs, ProcessedMessage>,
  ) {}

  async execute(
    callbacks: ToolCall[],
    userMessage: string,
    messageHistory: Message[],
    ctx: LoopContext,
  ): Promise<ProcessedMessage> {
    const toLearn = callbacks.filter(cb => cb.name === TOOL_GET_SKILL);
    let toExecute = callbacks.filter(cb => cb.name !== TOOL_GET_SKILL);

    if (toLearn.length > 0) {
      const skillNames = toLearn.map(c => c.arguments.skill_name ?? c.arguments.name ?? c.name).join(', ');
      ctx.onProgress(`Learning phase: ${toLearn.length} skill(s) - ${skillNames}`);
      await this.learner.run({ toolCalls: toLearn, userMessage, messageHistory, ctx });

      const skillPrompt = replacePlaceholders(SKILL_READY_PROMPT, { v1: userMessage });
      const response = await this.ChatService.complete(
        skillPrompt,
        ctx.channel,
        ctx.options,
        messageHistory,
        ctx.message?.getSessionId(),
      );
      if (response.kind === 'message') return response.text;
      toExecute = response.calls.filter(cb => cb.name !== TOOL_GET_SKILL);

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

class ToolCallPipelineFactory {
  static create(logger: ILogger, ChatService: IChatService): IToolCallPipeline {
    const learner = LearnerWorkerFactory.create(logger);
    const executor = ExecutorWorkerFactory.create(logger);
    return new ToolCallPipeline(ChatService, learner, executor);
  }
}

export { IToolCallPipeline, ToolCallPipeline, ToolCallPipelineFactory };
