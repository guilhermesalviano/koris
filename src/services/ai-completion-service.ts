import { config } from '../config';
import type { ILogger } from '../infrastructure/logger';
import type { AIChatOptions, AIChatRequest, AIProvider, AIResponse } from '../types/chat';
import type { AIProviderRole } from './providers';
import { AuditLogLlm } from '../entities/audit-log';
import { IAuditService, AuditServiceFactory } from './audit/audit-service';
import { generateId } from '../utils/generate-id';
import { HTTP_ERROR_MESSAGES } from '../constants';

export type AIErrorCode = 'aborted' | 'timeout' | 'authentication' | 'rate_limited' | 'unavailable' | 'malformed_response' | 'unknown';

const HTTP_ERROR_CODES: Partial<Record<number, AIErrorCode>> = {
  400: 'malformed_response',
  401: 'authentication',
  403: 'authentication',
  404: 'unavailable',
  408: 'timeout',
  429: 'rate_limited',
  500: 'unavailable',
  502: 'unavailable',
  503: 'unavailable',
  504: 'timeout',
};

export class AIServiceError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }

  toJSON(): { code: AIErrorCode; statusCode?: number; message: string } {
    const payload: { code: AIErrorCode; statusCode?: number; message: string } = {
      code: this.code,
      message: this.message,
    };
    if (this.statusCode != null) payload.statusCode = this.statusCode;
    return payload;
  }
}

export interface IAICompletionService {
  complete(request: AIChatRequest, options?: AIChatOptions): Promise<AIResponse>;
}

export interface AICompletionServiceOptions {
  role?: AIProviderRole;
  agentName?: string;
  auditService?: IAuditService;
}

export class AICompletionService implements IAICompletionService {
  private readonly role: AIProviderRole;
  private readonly agentName?: string;
  private readonly auditService: IAuditService;

  constructor(
    private readonly provider: AIProvider,
    private readonly logger: ILogger,
    options?: AICompletionServiceOptions,
  ) {
    this.role = options?.role ?? 'manager';
    this.agentName = options?.agentName;
    this.auditService = options?.auditService ?? AuditServiceFactory.create(logger);
  }

  async complete(request: AIChatRequest, options?: AIChatOptions): Promise<AIResponse> {
    const startedAt = Date.now();
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;

    const providerOptions: AIChatOptions = {
      ...options,
      onUsage: (u) => { usage = u; },
    };

    try {
      const response = await this.provider.complete(request, providerOptions);
      this.recordAudit(request, options, Date.now() - startedAt, response, undefined, usage);
      return response;
    } catch (error) {
      const mapped = this.mapError(error, options?.signal);
      this.recordAudit(request, options, Date.now() - startedAt, undefined, mapped, usage);
      this.logger.error('AI completion failed', {
        provider: this.provider.name,
        code: mapped.code,
        statusCode: mapped.statusCode,
        error: mapped.message,
      });
      throw mapped;
    }
  }

  private recordAudit(
    request: AIChatRequest,
    options: AIChatOptions | undefined,
    durationMs: number,
    response?: AIResponse,
    error?: AIServiceError,
    usage?: { inputTokens?: number; outputTokens?: number },
  ): void {
    const prompt = JSON.stringify(request.messages);
    const responseText = response
      ? response.kind === 'message'
        ? response.text
        : JSON.stringify(response.calls)
      : undefined;

    const entry: AuditLogLlm = {
      id: generateId(),
      kind: 'llm',
      role: this.role,
      agentName: this.agentName,
      runId: options?.audit?.runId,
      sessionId: options?.audit?.sessionId,
      channel: options?.audit?.channel,
      provider: this.provider.name,
      model: request.model ?? this.resolveDefaultModel(),
      prompt,
      promptLength: prompt.length,
      response: responseText,
      responseLength: responseText?.length,
      finishReason: response?.finishReason,
      toolCalls: response?.kind === 'tool_calls' ? response.calls.length : 0,
      durationMs,
      status: error ? 'error' : 'success',
      errorCode: error?.code,
      errorMessage: error?.message,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      createdAt: new Date(),
    };

    this.auditService.record(entry);
  }

  private resolveDefaultModel(): string {
    return this.role === 'worker' ? config.AI.WORKERS.MODEL : config.AI.MANAGER.MODEL;
  }

  private mapError(error: unknown, signal?: AbortSignal): AIServiceError {
    if (error instanceof AIServiceError) return error;

    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const statusCode = this.extractStatusCode(message);

    const mappedMessage = statusCode != null ? HTTP_ERROR_MESSAGES[statusCode] : undefined;
    const userMessage = mappedMessage ?? message;

    if (signal?.aborted || normalized.includes('aborted')) {
      return new AIServiceError('aborted', userMessage, error, statusCode);
    }
    if (normalized.includes('timeout') || normalized.includes('timed out') || statusCode === 408 || statusCode === 504) {
      return new AIServiceError('timeout', userMessage, error, statusCode);
    }
    if (statusCode != null && HTTP_ERROR_CODES[statusCode]) {
      return new AIServiceError(HTTP_ERROR_CODES[statusCode] as AIErrorCode, userMessage, error, statusCode);
    }
    if (normalized.includes('401') || normalized.includes('403') || normalized.includes('authentication')) {
      return new AIServiceError('authentication', userMessage, error, statusCode);
    }
    if (normalized.includes('429') || normalized.includes('rate limit')) {
      return new AIServiceError('rate_limited', userMessage, error, statusCode);
    }
    if (normalized.includes('missing content') || normalized.includes('missing choices')) {
      return new AIServiceError('malformed_response', userMessage, error, statusCode);
    }
    if (normalized.includes('fetch') || normalized.includes('unavailable') || normalized.includes('503')) {
      return new AIServiceError('unavailable', userMessage, error, statusCode);
    }
    return new AIServiceError('unknown', userMessage, error, statusCode);
  }

  private extractStatusCode(message: string): number | undefined {
    const match = message.match(/\((\d{3})\)/) ?? message.match(/HTTP (\d{3})/);
    if (!match) return undefined;
    const status = Number(match[1]);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  }
}
