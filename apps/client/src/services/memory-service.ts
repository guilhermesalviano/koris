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
  save(sessionId: string, props: SaveMemoryProps): void;
  getAll(sessionId: string): Memory[];
}

class MemoryService implements IMemoryService {
  private memoryRepository: IMemoryRepository;

  constructor(memoryRepository: IMemoryRepository) {
    this.memoryRepository = memoryRepository;
  }

  save(sessionId: string, props: SaveMemoryProps): void {
    const memory = new Memory({
      sessionId: sessionId,
      type: props.type,
      content: props.content,
      embedding: props.embedding,
      tags: props.tags,
      importance: props.importance,
    });
    this.memoryRepository.save(memory);
  }

  getAll(sessionId: string): Memory[] {
    return this.memoryRepository.getBySessionId(sessionId);
  }

}

class MemoryServiceFactory {
  public static create(db: IDatabaseService): MemoryService {
    const memoryRepository = MemoryRepositoryFactory.create(db);

    return new MemoryService(memoryRepository);
  }
}

export { MemoryServiceFactory, IMemoryService, SaveMemoryProps }