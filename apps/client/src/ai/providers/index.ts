import type { AIProvider } from '../../types/provider';
import { config } from '../../config';
import { MockAIProvider } from './mock';
import { OllamaAIProvider } from './ollama';
import { ILogger } from '../../infrastructure/logger';

let cached: AIProvider | null = null;

export function getAIProvider(params: { logger: ILogger }): AIProvider {
  if (cached) return cached;

  const provider = config.AI.PROVIDER;

  cached = provider === 'ollama'
    ? new OllamaAIProvider(params.logger)
    : new MockAIProvider(params.logger);

  return cached;
}
