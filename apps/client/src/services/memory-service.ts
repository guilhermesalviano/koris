import { IDatabaseService } from "../infrastructure/db-sqlite";
import { Memory } from "../entities/memory";
import { MemoryType } from "../types/memory";
import { IMemoryRepository, MemoryRepositoryFactory } from "../repositories/memory";

interface SaveMemoryProps {
  type: MemoryType;
  content: string;
  embedding?: string;
  tags?: string;
  importance?: number;
}

interface IMemoryService {
  save(props: SaveMemoryProps): void;
  upsert(props: SaveMemoryProps): void;
  getAll(): Memory[];
}

class MemoryService implements IMemoryService {
  private memoryRepository: IMemoryRepository;
  private sessionId: string;

  constructor(memoryRepository: IMemoryRepository, sessionId: string) {
    this.memoryRepository = memoryRepository;
    this.sessionId = sessionId;
  }

  save(props: SaveMemoryProps): void {
    const memory = new Memory({
      sessionId: this.sessionId,
      type: props.type,
      content: props.content,
      embedding: props.embedding,
      tags: props.tags,
      importance: props.importance,
    });
    this.memoryRepository.save(memory);
  }

  upsert(props: SaveMemoryProps): void {
    const existing = this.memoryRepository
      .getBySessionId(this.sessionId)
      .find((m) => m.type === props.type);

    if (existing) {
      const updatedMemory = new Memory({
        id: existing.id,
        sessionId: existing.sessionId,
        type: props.type,
        content: this.mergeContent(existing.content, props.content),
        embedding: props.embedding ?? existing.embedding,
        tags: this.mergeTags(existing.tags, props.tags),
        importance: Math.max(existing.importance ?? 0, props.importance ?? 0),
        createdAt: existing.createdAt,
      });

      this.memoryRepository.update(updatedMemory);
    } else {
      this.save(props);
    }
  }

  getAll(): Memory[] {
    return this.memoryRepository.getBySessionId(this.sessionId);
  }

  private mergeContent(oldContent: string, newContent: string): string {
    if (oldContent.includes(newContent)) return oldContent;
    if (newContent.includes(oldContent)) return newContent;

    return `${oldContent}\n\n${newContent}`.trim();
  }

  private mergeTags(oldTags?: string, newTags?: string): string | undefined {
    const toSet = (tags?: string) =>
      tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const combined = [...new Set([...toSet(oldTags), ...toSet(newTags)])];

    return combined.length > 0 ? combined.join(', ') : undefined;
  }
}

class MemoryServiceFactory {
  public static create(db: IDatabaseService, sessionId: string): MemoryService {
    const memoryRepository = MemoryRepositoryFactory.create(db);

    return new MemoryService(memoryRepository, sessionId);
  }
}

export { IMemoryService, MemoryService, MemoryServiceFactory }
