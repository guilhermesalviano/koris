import { IMessageRepository } from "../repositories/message";
import { ISessionRepository } from "../repositories/session";

export type ProcessedMessage = string;
export type ProcessOptions = {
  signal?: AbortSignal;
  toolsEnabled?: boolean;
  onProgress?: (summary: string) => void;
  sessionId?: string;
  sessionRepo?: ISessionRepository;
  messageRepo?: IMessageRepository;
};