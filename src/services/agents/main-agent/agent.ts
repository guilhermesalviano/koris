import { handleCommand, isCommand } from '../../commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../../infrastructure/logger';
import { IDatabaseService } from '../../../infrastructure/db-sqlite';
import { ISessionService } from '../../session-service';
import { IMessageService, MessageServiceFactory } from '../../message-service';
import { ConversationWorkerFactory } from '../../workers/conversation-worker';
import { SummarizerFactory } from '../sub-agents/summarizer/sub-agent';
import { IMemoryService, MemoryServiceFactory } from '../../memory-service';
import { IManager, ManagerFactory } from '../sub-agents/manager';
import { ProcessedMessage, ProcessOptions } from '../../../types/agents';
import { MemoryType } from '../../../types/memory';
import { IWorker } from '../../../types/workers';
import { ISubAgent } from '../../../types/agents';
import { config } from '../../../config';

interface IAgent {
  handle(message: unknown, options?: ProcessOptions): Promise<ProcessedMessage>;
}

class Agent implements IAgent {
  constructor(
    private logger: ILogger,
    private messageService: IMessageService,
    private memoryService: IMemoryService,
    private conversationWorker: IWorker,
    private summarizerWorker: ISubAgent,
    private manager: IManager,
    private channel: string,
    private sessionService: ISessionService,
  ) { }

  async handle(message: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const safeMessage = toSafeMessage(message);

    this.logger.info(`Processing message from ${this.channel}: "${previewMessage(safeMessage)}"`);

    // const result = (await handlePlan(safeMessage, this.logger, options)).response || '';

    // todo: do not limit commands with slash, but with a list of known commands
    if (isCommand(safeMessage)) {
      const response = handleCommand(safeMessage, { source: this.channel }).response || '';
      this.historyHelper(safeMessage, response);
      return response;
    }

    const response = await this.manager.run({
      userMessage: safeMessage,
      channel: this.channel,
      message: this.messageService,
      options: { ...options },
    });

    // if (typeof response !== 'string') {
    //   return this.persistAssistantStream(response, safeMessage);
    // }

    this.historyHelper(safeMessage, response);
    this.summarizerHelper(safeMessage, response);

    return response;
  }

  private historyHelper(ask: string, answer: string) {
    this.conversationWorker.run({
      sessionId: this.sessionService.getSession().id,
      ask,
      answer,
      channel: this.channel,
    })
      .catch((err: unknown) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  private summarizerHelper(ask: string, answer: string, type: MemoryType = "summary") {
    if (!config.AI.SUMMARIZER.ENABLED) return;

    const conversation = {
      sessionId: this.sessionService.getSession().id,
      ask,
      answer,
      type,
      channel: this.channel,
      memoryService: this.memoryService,
    };

    this.summarizerWorker.handler(conversation)
      .catch((err: unknown) =>
        this.logger.error('Background summarizer failed', { err })
      );
  }
}

class AgentFactory {
  static create(logger: ILogger, channel: string, db: IDatabaseService, session: ISessionService): Agent {
    const messageService = MessageServiceFactory.create(db, session);
    const memoryService = MemoryServiceFactory.create(db, session);
    const conversationWorker = ConversationWorkerFactory.create(logger, messageService);
    const summarizerWorker = SummarizerFactory.create(logger);
    const manager = ManagerFactory.create(logger);

    return new Agent(
      logger,
      messageService,
      memoryService,
      conversationWorker,
      summarizerWorker,
      manager,
      channel,
      session,
    );
  }
}

export { IAgent, Agent, AgentFactory }
