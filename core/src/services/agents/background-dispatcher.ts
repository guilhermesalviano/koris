import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ILogger } from '../../infrastructure/logger';
import { ISessionManager } from '../session-manager';
import { IMemoryService } from '../memory-service';
import { ConversationWorkerFactory, ConversationWorkerProps } from '../workers/conversation-worker';
import type { CompactWorkerProps, CompactResult } from './sub-agents/summarizer/sub-agent';
import { SUMMARIZER } from './sub-agents/summarizer/key';
import { ISubAgentRegistry, SubAgentRegistrySingleton } from './sub-agents/registry';
import type { SubAgentScope } from './sub-agents/contracts';
import { IWorker } from '../../types/workers';
import { ImageAttachment } from '../../types/messages';

interface PersistConversationProps {
  sessionId: string;
  ask: string;
  askImages?: ImageAttachment[];
  answer: string;
  /** When set, `answer` is a failed provider turn — flags the assistant row. */
  answerErrorCode?: string;
  channel: string;
}

interface SummarizeConversationProps extends PersistConversationProps {
  memoryService: IMemoryService;
}

interface IBackgroundDispatcher {
  persistConversation(props: PersistConversationProps): void;
  summarizeConversation(props: SummarizeConversationProps): void;
  compactConversation(props: CompactWorkerProps): Promise<CompactResult | null>;
}

type SubAgentAccess = Pick<ISubAgentRegistry, 'get' | 'notifyTurnComplete'>;

class BackgroundDispatcher implements IBackgroundDispatcher {
  constructor(
    private logger: ILogger,
    private conversationWorker: IWorker<ConversationWorkerProps, void>,
    private subAgents: () => SubAgentAccess,
    private scope?: SubAgentScope,
  ) {}

  persistConversation(props: PersistConversationProps): void {
    this.conversationWorker.run(props)
      .catch((err: unknown) =>
        this.logger.error('Background conversation processing failed', { err })
      );
  }

  summarizeConversation(props: SummarizeConversationProps): void {
    if (props.answerErrorCode) return;
    if (!props.answer || !props.answer.trim()) return;

    this.subAgents().notifyTurnComplete(props, this.scope);
  }

  async compactConversation(props: CompactWorkerProps): Promise<CompactResult | null> {
    if (!props.messages.length) return null;

    try {
      return await this.subAgents().get(SUMMARIZER, this.scope).compact(props);
    } catch (err: unknown) {
      this.logger.error('Compaction failed', { err });
      return null;
    }
  }
}

class BackgroundDispatcherFactory {
  static create(logger: ILogger, db: IDatabaseService, sessionManager: ISessionManager): IBackgroundDispatcher {
    const conversationWorker = ConversationWorkerFactory.create(logger, db, sessionManager);
    return new BackgroundDispatcher(logger, conversationWorker, () => SubAgentRegistrySingleton.require(), { db, sessionManager });
  }
}

export { IBackgroundDispatcher, BackgroundDispatcher, BackgroundDispatcherFactory };
