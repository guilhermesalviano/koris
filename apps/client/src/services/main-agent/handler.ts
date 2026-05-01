import { handleCommand, isCommand } from '../commands';
import { previewMessage, toSafeMessage } from './helpers';
import { ILogger } from '../../infrastructure/logger';
import { DatabaseServiceFactory } from '../../infrastructure/db-sqlite';
import { ProcessedMessage, ProcessOptions } from '../../types/agents';
import { SessionServiceFactory } from '../session-service';
import { IMessageService, MessageServiceFactory } from '../message-service';
import { manager } from '../workers/manager';
import { summarizerWorker } from '../sub-agents/summarizer';
import { IMemoryService, MemoryServiceFactory } from '../memory-service';
import { conversationWorker } from '../workers/conversation-worker';
import { MemoryType } from '../../types/memory';
import { THINK_START, THINK_END, RESPONSE_ANCHOR } from '../../constants/thinking';

interface IAgentHandler {
  handle(message: unknown, options?: ProcessOptions): Promise<ProcessedMessage>;
}

class AgentHandler {
  constructor(
    private logger: ILogger,
    private messageService: IMessageService,
    private memoryService: IMemoryService,
    private channel: string,
    private sessionId: string,
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

    const response = await manager(this.logger, safeMessage, this.channel, this.messageService, { ...options });

    if (typeof response !== 'string') {
      return this.persistAssistantStream(response, safeMessage);
    }

    this.historyHelper(safeMessage, response);
    this.summarizerHelper(safeMessage, response);

    return response;
  }

  private async *persistAssistantStream(
    stream: AsyncGenerator<string>,
    ask: string,
  ): AsyncGenerator<string> {
    let fullResponse = '';

    for await (const chunk of stream) {
      fullResponse += chunk;
      yield chunk;
    }

    const cleanResponse = stripStreamMarkers(fullResponse);
    if (cleanResponse.length > 0) {
      this.historyHelper(ask, cleanResponse);
      this.summarizerHelper(ask, cleanResponse);
    }
  }

  private historyHelper(ask: string, answer: string) {
    const conversation = {
      sessionId: this.sessionId,
      ask,
      answer,
      logger: this.logger,
      channel: this.channel,
      messageService: this.messageService,
    };

    conversationWorker(conversation)
      .catch((err) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  private summarizerHelper(ask: string, answer: string, type: MemoryType = "summary") {
    const conversation = {
      sessionId: this.sessionId,
      ask,
      answer,
      type,
      logger: this.logger,
      channel: this.channel,
      memoryService: this.memoryService,
    };

    summarizerWorker(conversation)
      .catch((err) =>
        this.logger.error('Background summarizer failed', { err })
      );
  }
}

/** Strips internal stream sentinel markers before persisting to DB. */
function stripStreamMarkers(text: string): string {
  const thinkPattern = new RegExp(
    `${escapeRegex(THINK_START)}[\\s\\S]*?(?:${escapeRegex(THINK_END)}|$)`,
    'g',
  );
  return text
    .replace(thinkPattern, '')
    .replace(new RegExp(escapeRegex(RESPONSE_ANCHOR), 'g'), '')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[\x00-\x1f\\^$.|?*+()[\]{}]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

class AgentHandlerFactory {
  static create(logger: ILogger, channel: string): AgentHandler {
    const database = DatabaseServiceFactory.create();
    
    const sessionService = SessionServiceFactory.create(database, channel);
    const sessionId = sessionService.getSession().id;

    const messageService = MessageServiceFactory.create(database, sessionService);
    const memoryService = MemoryServiceFactory.create(database, sessionId);

    return new AgentHandler(logger, messageService, memoryService, channel, sessionId);
  }
}

export { AgentHandlerFactory, IAgentHandler }