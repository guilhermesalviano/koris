import { generateId } from "../utils/generate-id";
import { nowISO } from "../utils/date";
import { MessageRole, ImageAttachment } from "../types/messages";

export class Message {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly role: MessageRole;
  public readonly content: string;
  public readonly images?: ImageAttachment[];
  public readonly missingImages?: number;
  public readonly createdAt: string;

  constructor(data: {
    id?: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    images?: ImageAttachment[];
    missingImages?: number;
    createdAt?: string;
  }) {
    this.id = data.id || generateId();
    this.sessionId = data.sessionId;
    this.role = data.role;
    this.content = data.content;
    this.images = data.images;
    this.missingImages = data.missingImages;
    this.createdAt = data.createdAt || nowISO();
  }
}