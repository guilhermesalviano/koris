import { IToolsQueue, ToolsQueueFactory } from '../tools-queue';
import { TOOL_EXECUTION_CONTRACT } from '../../constants';
import type { ProcessedMessage, ProcessOptions } from '../../types/agents';
import type { IMessageService } from '../message-service';
import type { ILogger } from '../../infrastructure/logger';
import type { IChatService } from '../../types/chat';
import type { LoopContext } from '../../types/context';
import { ChatServiceFactory } from '../chat/chat-service';
import { IToolCallPipeline, ToolCallPipelineFactory } from './tool-call-pipeline';

interface MainAgentArgs {
  userMessage: string;
  channel: string;
  message: IMessageService;
  options?: ProcessOptions;
}

interface IMainAgent {
  run(args: MainAgentArgs): Promise<ProcessedMessage>;
}

const NEVER_ABORTED = new AbortController().signal;

class MainAgent implements IMainAgent {
  constructor(
    private logger: ILogger,
    private ChatService: IChatService,
    private toolsQueue: IToolsQueue,
    private pipeline: IToolCallPipeline,
  ) {}

  async run(args: MainAgentArgs): Promise<ProcessedMessage> {
    const { userMessage, channel, message, options } = args;
    const messageHistory = message.getHistory();

    const ctx: LoopContext = {
      channel,
      message,
      toolsQueue: this.toolsQueue,
      signal: options?.signal ?? NEVER_ABORTED,
      onProgress: options?.onProgress ?? ((progress) => this.logger.info(progress)),
      options,
      initiatedBy: 'manager',
    };

    const response = await this.ChatService.complete(userMessage, channel, options, messageHistory, message.getSessionId(), [TOOL_EXECUTION_CONTRACT]);
    if (response.kind === 'message') return response.text;
    return this.pipeline.execute(response.calls, userMessage, messageHistory, ctx);
  }
}

class MainAgentFactory {
  static create(logger: ILogger): IMainAgent {
    const ChatService = ChatServiceFactory.create(logger, 'manager', 'manager');
    const toolsQueue = ToolsQueueFactory.create(logger);
    const pipeline = ToolCallPipelineFactory.create(logger);
    return new MainAgent(logger, ChatService, toolsQueue, pipeline);
  }
}

export { IMainAgent, MainAgent, MainAgentFactory };
