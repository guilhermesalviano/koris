import type { AIProvider } from '../../types/provider';
import { config } from '../../config';
import { MockAIProvider } from './mock';
import { OllamaAIProvider } from './ollama';
import { ILogger } from '../../infrastructure/logger';

let cached: AIProvider | null = null;

export function getAIProvider(params: { logger: ILogger }): AIProvider {
  if (cached) return cached;

  const provider = config.AI.PROVIDER;

  const providerMap: Record<string, new (logger: ILogger) => AIProvider> = {
    ollama: OllamaAIProvider,
    mock: MockAIProvider,
  }

  const ProviderClass = providerMap[provider] || MockAIProvider;
  cached = new ProviderClass(params.logger);

  return cached;
}
