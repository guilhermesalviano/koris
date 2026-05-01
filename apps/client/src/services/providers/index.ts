import type { AIProvider } from '../../types/provider';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { OllamaAIProviderFactory } from './ollama';
import { MockAIProviderFactory } from './mock';

/**
 * Registry of available AI provider factories
 */
const PROVIDER_FACTORIES = {
  ollama: OllamaAIProviderFactory,
  mock: MockAIProviderFactory,
} as const;

type ProviderType = keyof typeof PROVIDER_FACTORIES;

/**
 * Singleton cache for AI provider instance
 */
class ProviderCache {
  private instance: AIProvider | null = null;
  private cachedLogger: ILogger | null = null;

  get(logger: ILogger): AIProvider | null {
    if (this.instance && this.cachedLogger !== logger) {
      this.clear();
    }
    return this.instance;
  }

  set(provider: AIProvider, logger: ILogger): void {
    this.instance = provider;
    this.cachedLogger = logger;
  }

  clear(): void {
    this.instance = null;
    this.cachedLogger = null;
  }
}

const cache = new ProviderCache();

/**
 * Get or create AI provider instance based on configuration.
 * Provider is cached as a singleton per logger instance.
 * 
 * @throws {Error} If configured provider is not supported
 */
export function getAIProvider(logger: ILogger): AIProvider {
  const cached = cache.get(logger);
  if (cached) {
    return cached;
  }

  const provider = createProvider(logger);
  cache.set(provider, logger);

  return provider;
}

/**
 * Create a new provider instance based on configuration
 */
function createProvider(logger: ILogger): AIProvider {
  const providerType = config.AI.PROVIDER as string;

  if (!isValidProvider(providerType)) {
    logger.warn(`Unknown provider "${providerType}", falling back to mock`);
    return PROVIDER_FACTORIES.mock.create(logger);
  }

  logger.info(`Initializing AI provider: ${providerType}`);
  return PROVIDER_FACTORIES[providerType].create(logger);
}

/**
 * Type guard to validate provider type
 */
function isValidProvider(provider: string): provider is ProviderType {
  return provider in PROVIDER_FACTORIES;
}

/**
 * Clear the cached provider instance (useful for testing)
 */
export function clearProviderCache(): void {
  cache.clear();
}

/**
 * Get list of supported provider types
 */
export function getSupportedProviders(): readonly ProviderType[] {
  return Object.keys(PROVIDER_FACTORIES) as ProviderType[];
}