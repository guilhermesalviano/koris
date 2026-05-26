import { generateId } from "../utils/generate-id";
import { MemoryType } from "../types/memory";

export class Memory {
  public id: string;
  public sessionId: string;
  public type: MemoryType;
  public content: string;
  public embedding?: string;
  public tags?: string;
  public importance?: number;
  public createdAt: Date;

  constructor(data: {
    id?: string;
    sessionId: string;
    type: MemoryType;
    content: string;
    embedding?: string;
    tags?: string;
    importance?: number;
    createdAt?: Date;
  }) {
    this.id = data.id || generateId();
    this.sessionId = data.sessionId;
    this.type = data.type;
    this.content = data.content;
    this.embedding = data.embedding;
    this.tags = data.tags;
    this.importance = data.importance;
    this.createdAt = data.createdAt || new Date();
  }
}