import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions } from "../../../types/agents";
import type { IMessageService } from "../../message-service";
import type { IToolsQueue } from "../../tools-queue";

export interface LoopContext {
  logger: ILogger;
  channel: string;
  message: IMessageService;
  toolsQueue: IToolsQueue;
  signal: AbortSignal;
  onProgress: (msg: string) => void;
  options?: ProcessOptions;
}