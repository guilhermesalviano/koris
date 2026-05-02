import { Message } from '../entities/message';
import { IDatabaseService } from '../infrastructure/db-sqlite';

interface IMessageRepository {
  save(message: Message): void;
  deleteById(id: string): void;
  getBySessionId(sessionId: string): Message[];
}

class MessageRepository implements IMessageRepository {
  constructor(private db: IDatabaseService) { }

  save(message: Message): void {
    this.db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.createdAt
      ]
    );
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
  }

  getBySessionId(sessionId: string): Message[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, role, content, created_at FROM messages 
       WHERE session_id = ? 
       ORDER BY created_at ASC`,
      [sessionId]
    );
    
    return rows.map((row: any) => new Message({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }
}

class MessageRepositoryFactory {
  public static create(db: IDatabaseService): MessageRepository {
    return new MessageRepository(db);
  }
}

export { IMessageRepository, MessageRepository, MessageRepositoryFactory };