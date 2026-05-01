import { Session } from "../entities/session";
import { IDatabaseService } from "../infrastructure/db-sqlite";
import { ISessionRepository, SessionRepositoryFactory } from "../repositories/session";

interface ISessionService {
  getSession(): Session;
  updateCount(): void;
}

class SessionService implements ISessionService {
  private sessionRepository: ISessionRepository;
  private session: Session;

  constructor(sessionRepository: ISessionRepository, session: Session) {
    this.sessionRepository = sessionRepository;
    this.sessionRepository.save(session);
    this.session = session;
  }

  getSession(): Session {
    return this.session;
  }

  updateCount(): void {
    const updatedSession = new Session({
      ...this.session,
      messageCount: this.session.messageCount + 1,
    });
    this.sessionRepository.update(this.session.id, updatedSession);
    this.session = updatedSession;
  }
}

class SessionServiceFactory {
  public static create(db: IDatabaseService, source: string): SessionService {
    const sessionRepository = SessionRepositoryFactory.create(db);

    const session = new Session({
      source,
    });

    return new SessionService(sessionRepository, session);
  }
}

export { ISessionService, SessionService,  SessionServiceFactory }