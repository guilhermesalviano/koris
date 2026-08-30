import { Message } from '../entities/message';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { generateId } from '../utils/generate-id';
import { IImageRepository, ImageRepositoryFactory } from './image';

interface IMessageRepository {
  save(message: Message): void;
  deleteById(id: string): void;
  getBySessionId(sessionId: string, limit?: number): Message[];
  getPreviewBySessionId(sessionId: string): string | null;
  count(): number;
}

class MessageRepository implements IMessageRepository {
  constructor(
    private db: IDatabaseService,
    private imageRepository: IImageRepository,
  ) { }

  save(message: Message): void {
    const imageIds = message.images?.map((image) => {
      const id = generateId();
      this.imageRepository.save({ id, data: image.data, mimeType: image.mimeType });
      return id;
    }) ?? [];

    this.db.run(
      `INSERT INTO messages (id, session_id, role, content, image_ids, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.sessionId,
        message.role,
        message.content,
        imageIds.length ? JSON.stringify(imageIds) : null,
        message.errorCode ?? null,
        message.createdAt
      ]
    );
  }

  deleteById(id: string): void {
    this.db.run('DELETE FROM messages WHERE id = ?', [id]);
  }

  getBySessionId(sessionId: string, limit = 15): Message[] {
    const rows = this.db.query<any>(
      `SELECT id, session_id, role, content, image_ids, error_code, created_at FROM (
         SELECT id, session_id, role, content, image_ids, error_code, created_at FROM messages
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       ) recent_messages
       ORDER BY created_at ASC`,
      [sessionId, limit]
    );

    return rows.map((row: any) => {
      const imageIds = this.parseImageIds(row.image_ids);
      const images = this.imageRepository.getByIds(imageIds).map(({ data, mimeType }) => ({ data, mimeType }));
      const missingImages = imageIds.length - images.length;

      return new Message({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        images: images.length ? images : undefined,
        missingImages: missingImages > 0 ? missingImages : undefined,
        errorCode: row.error_code ?? undefined,
        createdAt: row.created_at
      });
    });
  }

  private parseImageIds(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }

  getPreviewBySessionId(sessionId: string): string | null {
    const row = this.db.get(
      `SELECT content FROM messages
       WHERE session_id = ? AND role = 'user'
       ORDER BY created_at ASC
       LIMIT 1`,
      [sessionId],
    ) as { content?: string } | undefined;

    return row?.content ?? null;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) AS total FROM messages') as { total?: number } | undefined;
    return row?.total ?? 0;
  }
}

class MessageRepositoryFactory {
  public static create(db: IDatabaseService): MessageRepository {
    return new MessageRepository(db, ImageRepositoryFactory.create(db));
  }
}

export { IMessageRepository, MessageRepository, MessageRepositoryFactory };
