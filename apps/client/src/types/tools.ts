import { ILogger } from "../infrastructure/logger";
import { IMessageService } from "../services/message-service";
import { ToolsQueue } from "../services/tools-queue";
import { ProcessOptions } from "./agents";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
}

export type CommandFn = (logger: ILogger, args: Record<string, unknown>) => Promise<ToolResult>;

export interface LoopContext {
  logger: ILogger;
  channel: string;
  message: IMessageService;
  toolsQueue: ToolsQueue;
  signal: AbortSignal;
  onProgress: (msg: string) => void;
  options?: ProcessOptions;
}