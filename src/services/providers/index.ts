import type { AIProvider, AIProviderOptions } from '../../types/chat';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { OllamaAIProviderFactory } from './ollama';
import { MockAIProviderFactory } from './mock';
import { NvidiaAIProviderFactory } from './nvidia';
import { SerialAIProvider } from './serial-provider';

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

export const AI_PRIORITY_BACKGROUND = 0;
export const AI_PRIORITY_INTERACTIVE = 1;

export interface GetAIProviderOptions {
  background?: boolean;
}

/**
 * Singleton cache for AI provider instances, keyed by role and priority mode.
 */
class ProviderCache {
  private instances = new Map<string, AIProvider>();
  private cachedLogger: ILogger | null = null;

  get(logger: ILogger, key: string): AIProvider | null {
    if (this.cachedLogger !== null && this.cachedLogger !== logger) {
      this.clear();
    }
    return this.instances.get(key) ?? null;
  }

  set(provider: AIProvider, logger: ILogger, key: string): void {
    if (this.cachedLogger !== null && this.cachedLogger !== logger) {
      this.clear();
    }
    this.cachedLogger = logger;
    this.instances.set(key, provider);
  }

  clear(): void {
    this.instances.clear();
    this.cachedLogger = null;
  }
}

const cache = new ProviderCache();

/**
 * Get or create AI provider instance based on configuration and role.
 * Provider is cached as a singleton per logger, role and priority mode.
 *
 * When `ai.parallel` is false the shared `SerialAIProvider` queue ensures
 * manager and worker LLM calls never run at the same time. `background`
 * callers (summarizer, heartbeat) get lower queue priority so they never
 * block interactive requests. When `ai.parallel` is true the same wrapper
 * still tracks in-flight activity for observability but runs calls
 * concurrently.
 *
 * @throws {Error} If configured provider is not supported
 */
export function getAIProvider(
  logger: ILogger,
  role: AIProviderRole = 'manager',
  options?: GetAIProviderOptions,
): AIProvider {
  const priority = options?.background ? AI_PRIORITY_BACKGROUND : AI_PRIORITY_INTERACTIVE;
  const label = options?.background ? `${role}:background` : role;
  const key = `${role}:${priority}`;
  const cached = cache.get(logger, key);
  if (cached) {
    return cached;
  }

  const provider = createAIProvider(logger, role);
  const resolved = new SerialAIProvider(provider, undefined, priority, label);
  cache.set(resolved, logger, key);

  return resolved;
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
