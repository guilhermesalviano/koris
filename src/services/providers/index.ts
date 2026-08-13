import type { AIProvider, AIProviderOptions } from '../../types/chat';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { OllamaAIProviderFactory } from './ollama';
import { MockAIProviderFactory } from './mock';
import { NvidiaAIProviderFactory } from './nvidia';

/**
 * Registry of available AI provider factories
 */
const PROVIDER_FACTORIES = {
  ollama: OllamaAIProviderFactory,
  mock: MockAIProviderFactory,
  nvidia: NvidiaAIProviderFactory,
} as const;

type ProviderType = keyof typeof PROVIDER_FACTORIES;

export type AIProviderRole = 'manager' | 'worker';

/**
 * Singleton cache for AI provider instances, keyed by role.
 */
class ProviderCache {
  private instances = new Map<AIProviderRole, AIProvider>();
  private cachedLogger: ILogger | null = null;

  get(logger: ILogger, role: AIProviderRole): AIProvider | null {
    if (this.cachedLogger !== null && this.cachedLogger !== logger) {
      this.clear();
    }
    return this.instances.get(role) ?? null;
  }

  set(provider: AIProvider, logger: ILogger, role: AIProviderRole): void {
    this.cachedLogger = logger;
    this.instances.set(role, provider);
  }

  clear(): void {
    this.instances.clear();
    this.cachedLogger = null;
  }
}

const cache = new ProviderCache();

/**
 * Get or create AI provider instance based on configuration and role.
 * Provider is cached as a singleton per logger and role.
 *
 * @throws {Error} If configured provider is not supported
 */
export function getAIProvider(logger: ILogger, role: AIProviderRole = 'manager'): AIProvider {
  const cached = cache.get(logger, role);
  if (cached) {
    return cached;
  }

  const provider = createAIProvider(logger, role);
  cache.set(provider, logger, role);

  return provider;
}

/**
 * Create a new provider instance based on configuration and role
 */
export function createAIProvider(logger: ILogger, role: AIProviderRole = 'manager'): AIProvider {
  const profile = role === 'worker' ? config.AI.WORKERS : config.AI.MANAGER;
  const providerType = profile.PROVIDER as string;

  if (!isValidProvider(providerType)) {
    logger.warn(`Unknown provider "${providerType}", falling back to mock`);
    return PROVIDER_FACTORIES.mock.create(logger);
  }

  const opts: AIProviderOptions = {
    baseUrl: profile.BASE_URL,
    model: profile.MODEL,
    apiToken: profile.API_TOKEN,
    embeddingEnabled: config.AI.WORKERS.EMBEDDING_ENABLED,
    embeddingModel: config.AI.WORKERS.EMBED_MODEL,
  };

  logger.info(`Initializing AI provider: ${providerType} (${role})`);
  return PROVIDER_FACTORIES[providerType].create(logger, opts);
}

/**
 * Type guard to validate provider type
 */
function isValidProvider(provider: string): provider is ProviderType {
  return provider in PROVIDER_FACTORIES;
}

/**
 * Clear the cached provider instances (useful for testing)
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
