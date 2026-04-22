import { randomUUID } from "node:crypto";
import { MemoryType } from "../types/memory";

export class Memory {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly type: MemoryType;
  public readonly content: string;
  public readonly embedding?: string;
  public readonly tags?: string;
  public readonly importance?: number;
  public readonly createdAt: Date;

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
    this.id = data.id || randomUUID();
    this.sessionId = data.sessionId;
    this.type = data.type;
    this.content = data.content;
    this.embedding = data.embedding;
    this.tags = data.tags;
    this.importance = data.importance;
    this.createdAt = data.createdAt || new Date();
  }
}