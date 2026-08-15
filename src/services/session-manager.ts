import { IDatabaseService } from "../infrastructure/db-sqlite";
import { SessionRepositoryFactory } from "../repositories/session";
import { SessionService, ISessionService } from "./session-service";
import { config } from "../config";
import { getLastActivityAt, isSessionExpired } from "../utils/session";
import { Session } from "../entities/session";

export interface ISessionManager {
  getSessionService(entryChannel: string): ISessionService;
  getSessionServiceById(sessionId: string): ISessionService;
}

export class SessionManager implements ISessionManager {
  private cache: Map<string, ISessionService> = new Map();
  private byIdCache: Map<string, ISessionService> = new Map();

  constructor(private db: IDatabaseService) {}

  getSessionService(entryChannel: string): ISessionService {
    if (this.cache.has(entryChannel)) {
      return this.cache.get(entryChannel)!;
    }

    const sessionRepository = SessionRepositoryFactory.create(this.db);
    const existing = sessionRepository.findLatestOpenByEntryChannel(entryChannel);

    let sessionService: ISessionService;

    if (existing && !isSessionExpired(getLastActivityAt(existing), config.SESSION.TTL_MS)) {
      sessionService = new SessionService(sessionRepository, existing, { persistOnConstruct: false });
    } else {
      const session = new Session({ entryChannel });
      sessionService = new SessionService(sessionRepository, session);
    }

    this.cache.set(entryChannel, sessionService);
    return sessionService;
  }

  getSessionServiceById(sessionId: string): ISessionService {
    if (this.byIdCache.has(sessionId)) {
      return this.byIdCache.get(sessionId)!;
    }

    const sessionRepository = SessionRepositoryFactory.create(this.db);
    const session = sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const sessionService = new SessionService(sessionRepository, session, {
      persistOnConstruct: false,
      rotateOnExpire: false,
    });
    this.byIdCache.set(sessionId, sessionService);
    return sessionService;
  }
}
