import type { ProcessOptions } from "../types/agents";
import type { IMessageService } from "../services/message-service";
import type { IToolsQueue } from "../services/tools-queue";
import type { ImageAttachment } from "./messages";

export interface LoopContext {
  channel: string;
  message?: IMessageService;
  images?: ImageAttachment[];
  toolsQueue: IToolsQueue;
  signal: AbortSignal;
  onProgress: (msg: string) => void;
  options?: ProcessOptions;
  initiatedBy?: 'manager' | 'heartbeat' | 'summarizer';
}