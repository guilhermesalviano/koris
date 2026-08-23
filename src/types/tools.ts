import type { ILogger } from "../infrastructure/logger";
import type { StickerReference } from "../../plugins/contracts";

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  toolCallId?: string;
}

export interface ToolExecutionContext {
  channel?: string;
  sessionId?: string;
  runId?: string;
  agentName?: string;
  stickers?: StickerReference[];
  target?: string;
}

export type CommandFn = (
  logger: ILogger,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
) => Promise<ToolResult>;

export interface AIAgentRequest {
  model?: string;
}
