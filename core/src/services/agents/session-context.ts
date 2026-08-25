import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { ILogger } from '../../infrastructure/logger';
import { MessageServiceFactory, IMessageService } from '../message-service';
import { MemoryServiceFactory, IMemoryService } from '../memory-service';
import { ISessionManager } from '../session-manager';
import { ISessionService } from '../session-service';

export interface SessionContext {
  sessionService: ISessionService;
  messageService: IMessageService;
  memoryService: IMemoryService;
}

export interface ISessionContextFactory {
  resolve(originId: string, sessionId?: string): SessionContext;
}

class SessionContextResolver implements ISessionContextFactory {
  constructor(
    private logger: ILogger,
    private db: IDatabaseService,
    private sessionManager: ISessionManager,
  ) {}

  resolve(originId: string, sessionId?: string): SessionContext {
    const sessionService = this.resolveSessionService(originId, sessionId);
    return {
      sessionService,
      messageService: MessageServiceFactory.create(this.db, sessionService),
      memoryService: MemoryServiceFactory.create(this.db, sessionService),
    };
  }

  private resolveSessionService(originId: string, sessionId?: string): ISessionService {
    if (!sessionId) {
      return this.sessionManager.getSessionService(originId);
    }

    try {
      return this.sessionManager.getSessionServiceById(sessionId);
    } catch (err) {
      this.logger.warn(`Session "${sessionId}" not found, falling back to initiated channel session`, { originId, err });
      return this.sessionManager.getSessionService(originId);
    }
  }
}

class SessionContextFactory {
  static create(logger: ILogger, db: IDatabaseService, sessionManager: ISessionManager): ISessionContextFactory {
    return new SessionContextResolver(logger, db, sessionManager);
  }
}

export { SessionContextResolver, SessionContextFactory };
