import { Session, SessionProps } from '../entities/session';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { camelToSnakeCase } from '../utils/fields';
import { nowISO } from '../utils/date';

interface SessionRow {
  id: string;
  source: string;
  started_at?: string;
  ended_at?: string;
  message_count?: number;
  metadata?: string;
}

interface ISessionRepository {
  save(session: Session): void;
  update(id: string, updates: Partial<SessionProps>): void;
  findById(id: string): Session | null;
  findLatestOpenBySource(source: string): Session | null;
  findAll(limit?: number, offset?: number): Session[];
  count(): number;
  deleteExpired(): void;
  deleteById(id: string): void;
}

function mapRowToSession(row: SessionRow): Session {
  let metadata: Record<string, unknown> = {};

  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  }

  return new Session({
    id: row.id,
    source: row.source,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    messageCount: row.message_count,
    metadata,
  });
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
      fields.push(`${camelToSnakeCase(key)} = ?`);
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
    const row = this.db.get('SELECT * FROM sessions WHERE id = ?', [id]) as SessionRow | undefined;

    if (!row) return null;

    return mapRowToSession(row);
  }

  findLatestOpenBySource(source: string): Session | null {
    const row = this.db.get(
      `SELECT * FROM sessions
       WHERE source = ? AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
      [source],
    ) as SessionRow | undefined;

    if (!row) return null;

    return mapRowToSession(row);
  }

  findAll(limit = 50, offset = 0): Session[] {
    const rows = this.db.query<any>(
      `SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map((row: SessionRow) => mapRowToSession(row));
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as total FROM sessions') as { total: number } | undefined;
    return row?.total ?? 0;
  }

  deleteExpired(): void {
    this.db.run(
      'DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?',
      [nowISO()],
    );
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

export { ISessionRepository, SessionRepository, SessionRepositoryFactory };
