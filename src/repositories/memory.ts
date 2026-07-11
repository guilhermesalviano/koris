
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { Memory } from '../entities/memory';
import { MemoryType } from '../types/memory';
import { similarity } from 'ml-distance';

interface IMemoryRepository {
  save(memory: Memory): void;
  update(memory: Memory): void;
  getAll(): Memory[];
  getBySessionId(sessionId: string): Memory[];
  deleteById(id: string): void;
  search(queryEmbedding: number[], limit: number): Memory[];
}

class MemoryRepository implements IMemoryRepository {
  constructor(private db: IDatabaseService) { }

  save(memory: Memory): void {
    this.db.run(
      `INSERT INTO memories (id, session_id, source, type, content, embedding, tags, importance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.sessionId,
        memory.source,
        memory.type,
        memory.content,
        memory.embedding ? JSON.stringify(memory.embedding) : null,
        memory.tags ?? null,
        memory.importance ?? null,
        memory.createdAt.toISOString(),
      ]
    );
  }

  update(memory: Memory): void {
    this.db.run(
      `UPDATE memories SET type = ?, content = ?, embedding = ?, tags = ?, importance = ? WHERE id = ?`,
      [
        memory.type,
        memory.content,
        memory.embedding ? JSON.stringify(memory.embedding) : null,
        memory.tags ?? null,
        memory.importance ?? null,
        memory.id,
      ]
    );
  }

  getAll(): Memory[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, source, type, content, embedding, tags, importance, created_at FROM memories
       ORDER BY created_at DESC`
    );

    return rows.map(this.mapRow);
  }

  getBySessionId(sessionId: string): Memory[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, source, type, content, embedding, tags, importance, created_at FROM memories
       WHERE session_id = ?
       ORDER BY created_at DESC`,
      [sessionId]
    );

    return rows.map(this.mapRow);
  }

  search(queryEmbedding: number[], limit: number): Memory[] {
    const memories = this.getAll();
    const scoredMemories = memories
      .filter((m) => m.embedding)
      .map((m) => ({
        memory: m,
        score: similarity.cosine(queryEmbedding, m.embedding as any as number[])
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scoredMemories.map((sm) => sm.memory);
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM memories WHERE id = ?', [id]);
  }

  private mapRow(row: any): Memory {
    return new Memory({
      id: row.id,
      sessionId: row.session_id,
      source: row.source,
      type: row.type as MemoryType,
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
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

export { IMemoryRepository, MemoryRepository, MemoryRepositoryFactory };