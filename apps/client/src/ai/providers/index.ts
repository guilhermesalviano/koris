import type { AIProvider } from '../../types/provider';
import { config } from '../../config';
import { MockAIProvider } from './mock';
import { OllamaAIProvider } from './ollama';

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const provider = config.AI.PROVIDER;

  cached = provider === 'ollama'
    ? new OllamaAIProvider()
    : new MockAIProvider();

  return cached;
}
