import type { ILogger } from '../infrastructure/logger';
import type { AIChatOptions, AIChatRequest, AIProvider, AIResponse } from '../types/chat';

export type AIErrorCode = 'aborted' | 'timeout' | 'authentication' | 'rate_limited' | 'unavailable' | 'malformed_response' | 'unknown';

export class AIServiceError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIServiceError';
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
        error: mapped.message,
      });
      throw mapped;
    }
  }

  private mapError(error: unknown, signal?: AbortSignal): AIServiceError {
    if (error instanceof AIServiceError) return error;

    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (signal?.aborted || normalized.includes('aborted')) {
      return new AIServiceError('aborted', message, error);
    }
    if (normalized.includes('timeout') || normalized.includes('timed out')) {
      return new AIServiceError('timeout', message, error);
    }
    if (normalized.includes('401') || normalized.includes('403') || normalized.includes('authentication')) {
      return new AIServiceError('authentication', message, error);
    }
    if (normalized.includes('429') || normalized.includes('rate limit')) {
      return new AIServiceError('rate_limited', message, error);
    }
    if (normalized.includes('missing content') || normalized.includes('missing choices')) {
      return new AIServiceError('malformed_response', message, error);
    }
    if (normalized.includes('fetch') || normalized.includes('unavailable') || normalized.includes('503')) {
      return new AIServiceError('unavailable', message, error);
    }
    return new AIServiceError('unknown', message, error);
  }
}
