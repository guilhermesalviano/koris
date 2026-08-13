import { AIFinishReason } from "../types/chat";

export type AuditKind = 'llm' | 'tool';
export type AuditStatus = 'success' | 'error';
export type AuditRole = 'manager' | 'worker';

interface AuditLogBase {
  id: string;
  runId?: string;
  sessionId?: string;
  channel?: string;
  role: AuditRole;
  agentName?: string;
  createdAt: Date;
}

export interface AuditLogLlm extends AuditLogBase {
  kind: 'llm';
  provider: string;
  model?: string;
  prompt: string;
  promptLength?: number;
  response?: string;
  responseLength?: number;
  finishReason?: AIFinishReason;
  toolCalls: number;
  durationMs: number;
  status: AuditStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface AuditLogTool extends AuditLogBase {
  kind: 'tool';
  toolName: string;
  toolArgs?: string;
  success: boolean;
  response?: string;
  durationMs: number;
  status: AuditStatus;
  errorMessage?: string;
}

export type AuditLog = AuditLogLlm | AuditLogTool;
