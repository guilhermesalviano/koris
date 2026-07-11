import { IDatabaseService } from "../infrastructure/db-sqlite";
import { SessionRepositoryFactory } from "../repositories/session";
import { SessionService, ISessionService } from "./session-service";
import { config } from "../config";
import { getLastActivityAt, isSessionExpired } from "../utils/session";
import { Session } from "../entities/session";

export interface ISessionManager {
  getSessionService(source: string): ISessionService;
  getSessionServiceById(sessionId: string): ISessionService;
}

export class SessionManager implements ISessionManager {
  private cache: Map<string, ISessionService> = new Map();

  constructor(private db: IDatabaseService) {}

  getSessionService(source: string): ISessionService {
    if (this.cache.has(source)) {
      return this.cache.get(source)!;
    }

    const sessionRepository = SessionRepositoryFactory.create(this.db);
    const existing = sessionRepository.findLatestOpenBySource(source);

    let sessionService: ISessionService;

    if (existing && !isSessionExpired(getLastActivityAt(existing), config.SESSION.TTL_MS)) {
      sessionService = new SessionService(sessionRepository, existing, { persistOnConstruct: false });
    } else {
      const session = new Session({ source });
      sessionService = new SessionService(sessionRepository, session);
    }

    this.cache.set(source, sessionService);
    return sessionService;
  }

  getSessionServiceById(sessionId: string): ISessionService {
    const sessionRepository = SessionRepositoryFactory.create(this.db);
    const session = sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return this.getSessionService(session.source);
  }
}
