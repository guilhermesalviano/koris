
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { Memory } from '../entities/memory';
import { MemoryType } from '../types/memory';

interface IMemoryRepository {
  save(memory: Memory): void;
  getAll(): Memory[];
  getBySessionId(sessionId: string): Memory[];
  deleteById(id: string): void;
}

class MemoryRepository implements IMemoryRepository {
  constructor(private db: IDatabaseService) { }

  save(memory: Memory): void {
    this.db.run(
      `INSERT INTO memories (id, session_id, type, content, embedding, tags, importance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.sessionId,
        memory.type,
        memory.content,
        memory.embedding ?? null,
        memory.tags ?? null,
        memory.importance ?? null,
        memory.createdAt.toISOString(),
      ]
    );
  }

  getAll(): Memory[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, type, content, embedding, tags, importance, created_at FROM memories
       ORDER BY created_at ASC`
    );

    return rows.map(this.mapRow);
  }

  getBySessionId(sessionId: string): Memory[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, type, content, embedding, tags, importance, created_at FROM memories
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return rows.map(this.mapRow);
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM memories WHERE id = ?', [id]);
  }

  private mapRow(row: any): Memory {
    return new Memory({
      id: row.id,
      sessionId: row.session_id,
      type: row.type as MemoryType,
      content: row.content,
      embedding: row.embedding ?? undefined,
      tags: row.tags ?? undefined,
      importance: row.importance ?? undefined,
      createdAt: new Date(row.created_at),
    });
  }
}

class MemoryRepositoryFactory {
  public static create(db: IDatabaseService): MemoryRepository {
    return new MemoryRepository(db);
  }
}

export { IMemoryRepository, MemoryRepositoryFactory };