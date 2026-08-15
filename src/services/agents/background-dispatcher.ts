import { config } from '../../config';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ILogger } from '../../infrastructure/logger';
import { ISessionManager } from '../session-manager';
import { IMemoryService } from '../memory-service';
import { ConversationWorkerFactory, ConversationWorkerProps } from '../workers/conversation-worker';
import { SummarizerFactory, SummarizerWorkerProps } from './sub-agents/summarizer/sub-agent';
import { ISubAgent } from '../../types/agents';
import { IWorker } from '../../types/workers';

interface PersistConversationProps {
  sessionId: string;
  ask: string;
  answer: string;
  channel: string;
}

interface SummarizeConversationProps extends PersistConversationProps {
  memoryService: IMemoryService;
}

interface IBackgroundDispatcher {
  persistConversation(props: PersistConversationProps): void;
  summarizeConversation(props: SummarizeConversationProps): void;
}

class BackgroundDispatcher implements IBackgroundDispatcher {
  constructor(
    private logger: ILogger,
    private conversationWorker: IWorker<ConversationWorkerProps, void>,
    private summarizerWorker: ISubAgent<SummarizerWorkerProps>,
  ) {}

  persistConversation(props: PersistConversationProps): void {
    this.conversationWorker.run(props)
      .catch((err: unknown) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  summarizeConversation(props: SummarizeConversationProps): void {
    if (!config.AI.SUMMARIZER) return;

    this.summarizerWorker.handler(props)
      .catch((err: unknown) =>
        this.logger.error('Background summarizer failed', { err })
      );
  }
}

class BackgroundDispatcherFactory {
  static create(logger: ILogger, db: IDatabaseService, sessionManager: ISessionManager): IBackgroundDispatcher {
    const conversationWorker = ConversationWorkerFactory.create(logger, db, sessionManager);
    const summarizerWorker = SummarizerFactory.create(logger);
    return new BackgroundDispatcher(logger, conversationWorker, summarizerWorker);
  }
}

export { IBackgroundDispatcher, BackgroundDispatcher, BackgroundDispatcherFactory };
