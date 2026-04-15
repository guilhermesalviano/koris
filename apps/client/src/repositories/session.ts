import { Session, SessionProps } from '../entities/session';
import { IDatabaseService } from '../infrastructure/db-sqlite';

interface ISessionRepository {
  save(session: Session): void;
  update(id: string, updates: Partial<SessionProps>): void;
  findById(id: string): Session | null;
  deleteExpired(): void;
  deleteById(id: string): void;
}

class SessionRepository implements ISessionRepository {
  constructor(private db: IDatabaseService) { }

  save(session: Session): void {
    this.db.run(
      `INSERT INTO sessions (id, source, started_at, ended_at, message_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.source,
        session.startedAt,
        session.endedAt,
        session.messageCount,
        JSON.stringify(session.metadata),
      ]
    );
  }

  update(id: string, updates: Partial<SessionProps>): void {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }

    if (fields.length === 0) return;

    values.push(id);

    this.db.run(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  findById(id: string): Session | null {
    const row = this.db.get('SELECT * FROM sessions WHERE id = ?', [id]) as SessionProps | undefined;

    if (!row) return null;

    return new Session(row);
  }

  deleteExpired(): void {
    this.db.run('DELETE FROM sessions WHERE expiresAt < ?', [Date.now()]);
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
  }
}

class SessionRepositoryFactory {
  public static create(db: IDatabaseService): SessionRepository {
    return new SessionRepository(db);
  }
}

export { ISessionRepository, SessionRepositoryFactory };