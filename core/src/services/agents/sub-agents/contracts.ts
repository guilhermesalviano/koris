import type { IDatabaseService } from '../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../infrastructure/logger';
import type { IPromptRepository } from '../../../repositories/prompt';
import type { AuditRole } from '../../../entities/audit-log';
import type { ProcessedMessage } from '../../../types/agents';
import type { ImageAttachment } from '../../../types/messages';
import type { IAICompletionService } from '../../ai-completion-service';
import type { IMemoryService } from '../../memory-service';
import type { ISessionManager } from '../../session-manager';
import type { SessionContext } from '../session-context';
import type { TaskQueue } from './queue/task-queue';

export interface SubAgentDescriptor {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  messageable: boolean;
  listed: boolean;
  role: AuditRole;
}

export interface SubAgentKey<TApi extends object> extends SubAgentDescriptor {
  readonly __api?: TApi;
}

export interface SubAgentScope {
  db: IDatabaseService;
  sessionManager: ISessionManager;
}

export interface SubAgentServices extends SubAgentScope {
  logger: ILogger;
  completion: IAICompletionService;
  createPromptRepository(): IPromptRepository;
  queue: TaskQueue;
}

export interface CompletedTurn {
  sessionId: string;
  channel: string;
  ask: string;
  answer: string;
  answerErrorCode?: string;
  memoryService: IMemoryService;
}

export interface InboundPeerMessage {
  channel: string;
  originId: string;
  text: string;
  images?: ImageAttachment[];
  isCommand: boolean;
  isTrustedSender?: boolean;
  peerAliases?: string[];
}

export interface InboundClaim {
  sessionId: string;
  handle(ctx: SessionContext): Promise<ProcessedMessage>;
}

export interface SubAgentSchedule {
  start(): void;
  stop(): void;
}

export interface SubAgentTriggers {
  schedule?: SubAgentSchedule;
  onTurnComplete?(turn: CompletedTurn): Promise<void>;
  routeInbound?(message: InboundPeerMessage): Promise<InboundClaim | null>;
}

export interface SubAgentInstance<TApi extends object> {
  api: TApi;
  triggers?: SubAgentTriggers;
}

export interface SubAgentDefinition<TApi extends object = object> {
  key: SubAgentKey<TApi>;
  create(services: SubAgentServices): SubAgentInstance<TApi>;
}

export function defineSubAgentKey<TApi extends object>(descriptor: SubAgentDescriptor): SubAgentKey<TApi> {
  return Object.freeze({ ...descriptor });
}

export function defineSubAgent<TApi extends object>(
  key: SubAgentKey<TApi>,
  create: (services: SubAgentServices) => SubAgentInstance<TApi>,
): SubAgentDefinition<TApi> {
  return { key, create };
}
