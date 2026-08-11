import type { ILogger } from '../infrastructure/logger';
import type { AIChatOptions, AIChatRequest, AIProvider, AIResponse } from '../types/chat';
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

export class AICompletionService implements IAICompletionService {
  constructor(
    private readonly provider: AIProvider,
    private readonly logger: ILogger,
  ) {}

  async complete(request: AIChatRequest, options?: AIChatOptions): Promise<AIResponse> {
    try {
      return await this.provider.complete(request, options);
    } catch (error) {
      const mapped = this.mapError(error, options?.signal);
      this.logger.error('AI completion failed', {
        provider: this.provider.name,
        code: mapped.code,
        statusCode: mapped.statusCode,
        error: mapped.message,
      });
      throw mapped;
    }
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
