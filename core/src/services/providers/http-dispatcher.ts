import { Agent } from 'undici';
import { config } from '../../config';

type FetchDispatcher = NonNullable<RequestInit['dispatcher']>;

let cached: { timeoutMs: number; agent: Agent } | null = null;

/**
 * Dispatcher for AI provider requests. Node's built-in fetch gives up after
 * 5 minutes without response headers, or between two body chunks, whatever
 * `ai.timeouts` says — too short for a slow local model. Both limits follow
 * `ai.timeouts.hard_ms` instead, so the providers' own hard/idle timers decide.
 */
export function providerDispatcher(): FetchDispatcher {
  const timeoutMs = config.AI.TIMEOUTS.HARD_MS;
  if (cached?.timeoutMs !== timeoutMs) {
    // Let requests already in flight finish on the previous agent.
    void cached?.agent.close();
    cached = { timeoutMs, agent: new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs }) };
  }
  // Runtime-compatible (Node 24 bundles undici 7), but the global fetch types
  // come from @types/node's newer undici-types, whose handler typings differ.
  return cached.agent as unknown as FetchDispatcher;
}
