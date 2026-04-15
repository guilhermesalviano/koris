import { MessageRole } from "../types/messages";

export class Message {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly role: MessageRole;
  public readonly content: string;
  public readonly createdAt: string;

  constructor(data: {
    id: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    createdAt?: string;
  }) {
    this.id = data.id;
    this.sessionId = data.sessionId;
    this.role = data.role;
    this.content = data.content;
    this.createdAt = data.createdAt || new Date().toISOString();
  }
}