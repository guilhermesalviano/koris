
import { IDatabaseService } from '../infrastructure/db-sqlite';

type Memory = {
  id: string;
  sessionId: string;
  type: string;
  content: string;
  embedding: string;
  tags?: string;
  importance?: string;
  createdAt: Date;
};

interface IMemoryRepository {
  save(memory: Memory): void;
  getAll(): Memory[];
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
        memory.embedding,
        memory.tags,
        memory.importance,
        memory.createdAt
      ]
    );
  }

  getAll(): Memory[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, type, content, embedding, tags, importance, created_at FROM memories
       ORDER BY created_at ASC`
    );

    return rows.map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      content: row.content,
      embedding: row.embedding,
      tags: row.tags,
      importance: row.importance,
      createdAt: row.created_at
    }));
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
  }
}

class MemoryRepositoryFactory {
  public static create(db: IDatabaseService): MemoryRepository {
    return new MemoryRepository(db);
  }
}

export { IMemoryRepository, MemoryRepositoryFactory };