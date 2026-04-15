import { Session } from "../../entities/session";
import { IDatabaseService } from "../../infrastructure/db-sqlite";
import { ISessionRepository, SessionRepositoryFactory } from "../../repositories/session";

interface ISessionService {
  save(session: Session): string;
  findById(id: string): Session | null;
  update(id: string, updates: Partial<Session>): void;
  updateCount(params: { id: string; }): void;
}

class SessionService implements ISessionService {
  private sessionRepository: ISessionRepository;

  constructor(sessionRepository: ISessionRepository) {
    this.sessionRepository = sessionRepository;
  }

  save(session: Session): string {
    this.sessionRepository.save(session);
    return session.id;
  }

  findById(id: string): Session | null {
    return this.sessionRepository.findById(id);
  }

  update(id: string, updates: Partial<Session>): void {
    this.sessionRepository.update(id, updates);
  }

  updateCount(params: { id: string; }): void {
    const session = this.sessionRepository.findById(params.id);
    if (!session) {
      throw new Error(`Session with id ${params.id} not found`);
    }
    const updatedSession = new Session({
      ...session,
      messageCount: session.messageCount + 1,
    });
    this.sessionRepository.update(session.id, updatedSession);
  }
}

class SessionServiceFactory {
  public static create(db: IDatabaseService): SessionService {
    const sessionRepository = SessionRepositoryFactory.create(db);

    return new SessionService(sessionRepository);
  }
}

export { SessionServiceFactory, ISessionService }