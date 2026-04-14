import { Message } from '../entities/message';
import { IDataService } from '../infrastructure/db-sqlite';

interface IMessageRepository {
  save(message: Message): void;
  deleteById(id: string): void;
}

class MessageRepository implements IMessageRepository {
  constructor(private db: IDataService) { }

  save(message: Message): void {
    this.db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at, tool_calls, tool_results)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.created_at,
        JSON.stringify(message.tool_calls),
        JSON.stringify(message.tool_results),
      ]
    );
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
  }
}

export { MessageRepository, IMessageRepository };