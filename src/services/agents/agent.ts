import { handleCommand, isCommand } from '../commands';
import { previewMessage, toSafeMessage } from '../../utils/message';
import { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ISessionManager } from '../session-manager';
import { MessageServiceFactory } from '../message-service';
import { ConversationWorkerFactory } from '../workers/conversation-worker';
import { SummarizerFactory } from './sub-agents/summarizer/sub-agent';
import { IMemoryService, MemoryServiceFactory } from '../memory-service';
import { IManager, ManagerFactory } from './manager';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { IWorker } from '../../types/workers';
import { ISubAgent } from '../../types/agents';
import { config } from '../../config';
import { ISessionService } from '../session-service';
import { generateId } from '../../utils/generate-id';

interface IAgent {
  handle(message: string, originId: string, options?: ProcessOptions): Promise<ProcessedMessage>;
}

class Agent implements IAgent {
  constructor(
    private logger: ILogger,
    private db: IDatabaseService,
    private sessionManager: ISessionManager,
    private conversationWorker: IWorker,
    private summarizerWorker: ISubAgent,
    private manager: IManager,
    private channel: string,
  ) { }

  async handle(message: string, originId: string, options?: ProcessOptions): Promise<ProcessedMessage> {
    const sessionService = this.resolveSessionService(originId, options?.sessionId);
    const messageService = MessageServiceFactory.create(this.db, sessionService);
    const memoryService = MemoryServiceFactory.create(this.db, sessionService);
    const safeMessage = toSafeMessage(message);

    this.logger.info(`Processing message from ${this.channel} (origin: ${originId}): "${previewMessage(safeMessage)}"`);

    // todo: do not limit commands with slash, but with a list of known commands
    if (isCommand(safeMessage)) {
      const response = handleCommand(safeMessage, { source: this.channel }).response || '';
      this.historyHelper(safeMessage, response, sessionService);
      return response;
    }

    const response = await this.manager.run({
      userMessage: safeMessage,
      channel: this.channel,
      message: messageService,
      options: { ...options, runId: options?.runId ?? generateId() },
    });
    
    this.logger.info(`Processed message from ${this.channel}: "${previewMessage(safeMessage)}" => "${previewMessage(response)}"`);

    this.historyHelper(safeMessage, response, sessionService);
    this.summarizerHelper(safeMessage, response, sessionService, memoryService);

    return response;
  }

  private resolveSessionService(originId: string, sessionId?: string): ISessionService {
    if (!sessionId) {
      return this.sessionManager.getSessionService(originId);
    }

    try {
      return this.sessionManager.getSessionServiceById(sessionId);
    } catch {
      return this.sessionManager.getSessionService(originId);
    }
  }

  private historyHelper(ask: string, answer: string, sessionService: ISessionService) {
    this.conversationWorker.run({
      sessionId: sessionService.getSession().id,
      ask,
      answer,
      channel: this.channel,
    })
      .catch((err: unknown) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  private summarizerHelper(ask: string, answer: string, sessionService: ISessionService, memoryService: IMemoryService) {
    if (!config.AI.SUMMARIZER.ENABLED) return;

    const conversation = {
      sessionId: sessionService.getSession().id,
      ask,
      answer,
      channel: this.channel,
      memoryService: memoryService,
    };

    this.summarizerWorker.handler(conversation)
      .catch((err: unknown) =>
        this.logger.error('Background summarizer failed', { err })
      );
  }
}

class AgentFactory {
  static create(logger: ILogger, channel: string, db: IDatabaseService, sessionManager: ISessionManager): Agent {
    const conversationWorker = ConversationWorkerFactory.create(logger, db, sessionManager);
    const summarizerWorker = SummarizerFactory.create(logger);
    const manager = ManagerFactory.create(logger);

    return new Agent(
      logger,
      db,
      sessionManager,
      conversationWorker,
      summarizerWorker,
      manager,
      channel,
    );
  }
}

export { IAgent, Agent, AgentFactory }
