import { Message } from '../entities/message';
import { IDatabaseService } from '../infrastructure/db-sqlite';

interface IMessageRepository {
  save(message: Message): void;
  deleteById(id: string): void;
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
}

class MessageRepositoryFactory {
  public static create(db: IDatabaseService): MessageRepository {
    return new MessageRepository(db);
  }
}

export { IMessageRepository, MessageRepositoryFactory };