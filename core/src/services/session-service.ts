import { Session } from "../entities/session";
import { config } from "../config";
import { IDatabaseService } from "../infrastructure/db-sqlite";
import { ISessionRepository, SessionRepositoryFactory } from "../repositories/session";
import { getLastActivityAt, isSessionExpired } from "../utils/session";
import { nowISO } from "../utils/date";

interface ISessionService {
  getSession(): Session;
  ensureActiveSession(): Session;
  updateCount(): void;
}

class SessionService implements ISessionService {
  private sessionRepository: ISessionRepository;
  private session: Session;
  private readonly entryChannel: string;
  private readonly persistOnConstruct: boolean;
  private readonly rotateOnExpire: boolean;

  constructor(
    sessionRepository: ISessionRepository,
    session: Session,
    options: { persistOnConstruct?: boolean; rotateOnExpire?: boolean } = {},
  ) {
    this.sessionRepository = sessionRepository;
    this.entryChannel = session.entryChannel;
    this.persistOnConstruct = options.persistOnConstruct ?? true;
    this.rotateOnExpire = options.rotateOnExpire ?? true;

    if (this.persistOnConstruct) {
      this.sessionRepository.save(session);
    }

    this.session = session;
  }

  getSession(): Session {
    return this.session;
  }

  ensureActiveSession(): Session {
    if (!this.rotateOnExpire) {
      return this.session;
    }

    if (!this.isExpired(this.session)) {
      return this.session;
    }

    this.endSession(this.session);
    this.session = this.startNewSession(this.entryChannel);
    return this.session;
  }

  updateCount(): void {
    const now = nowISO();
    const updatedSession = new Session({
      ...this.session,
      messageCount: this.session.messageCount + 1,
      metadata: {
        ...this.session.metadata,
        lastActivityAt: now,
      },
    });
    this.sessionRepository.update(this.session.id, updatedSession);
    this.session = updatedSession;
  }

  private isExpired(session: Session): boolean {
    return isSessionExpired(
      getLastActivityAt(session),
      config.SESSION.TTL_MS,
    );
  }

  private endSession(session: Session): void {
    const endedAt = nowISO();
    this.sessionRepository.update(session.id, { endedAt });
  }

  private startNewSession(entryChannel: string): Session {
    const session = new Session({ entryChannel });
    this.sessionRepository.save(session);
    return session;
  }
}

class SessionServiceFactory {
  public static create(db: IDatabaseService, entryChannel: string): SessionService {
    const sessionRepository = SessionRepositoryFactory.create(db);
    const existing = sessionRepository.findLatestOpenByEntryChannel(entryChannel);

    if (existing && !isSessionExpired(getLastActivityAt(existing), config.SESSION.TTL_MS)) {
      return new SessionService(sessionRepository, existing, { persistOnConstruct: false });
    }

    const session = new Session({ entryChannel });
    return new SessionService(sessionRepository, session);
  }
}

export { ISessionService, SessionService, SessionServiceFactory };
