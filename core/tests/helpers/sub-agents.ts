import { vi } from 'vitest';
import { SubAgentRegistry, SubAgentRegistrySingleton } from '../../src/services/agents/sub-agents/registry';
import { TaskQueue } from '../../src/services/agents/sub-agents/queue/task-queue';
import { defineSubAgent, type SubAgentDefinition, type SubAgentScope, type SubAgentTriggers } from '../../src/services/agents/sub-agents/contracts';
import { NEGOTIATOR, type NegotiatorApi } from '../../src/services/agents/sub-agents/negotiator/key';
import { createNegotiatorInboundRoute } from '../../src/services/agents/sub-agents/negotiator';
import { SUMMARIZER, type SummarizerApi } from '../../src/services/agents/sub-agents/summarizer/key';
import type { ILogger } from '../../src/infrastructure/logger';

function silentLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

export function makeSubAgentRegistry(
  definitions: readonly SubAgentDefinition[],
  options: { logger?: ILogger; scope?: SubAgentScope; install?: boolean } = {},
): SubAgentRegistry {
  const registry = new SubAgentRegistry(
    options.logger ?? silentLogger(),
    options.scope ?? { db: {} as never, sessionManager: {} as never },
    { createQueue: () => new TaskQueue(1), createCompletion: () => ({ complete: vi.fn() }) as never },
  );
  for (const definition of definitions) registry.register(definition);
  if (options.install) SubAgentRegistrySingleton.setInstance(registry);
  return registry;
}

export function stubNegotiator(api: Partial<NegotiatorApi>, withInboundRoute = true): SubAgentDefinition<NegotiatorApi> {
  return defineSubAgent(NEGOTIATOR, ({ logger, db, sessionManager }) => {
    const full = api as NegotiatorApi;
    const triggers: SubAgentTriggers = withInboundRoute
      ? { routeInbound: createNegotiatorInboundRoute(full, { logger, db, sessionManager }) }
      : {};
    return { api: full, triggers };
  });
}

export function stubSummarizer(api: Partial<SummarizerApi>, onTurnComplete?: SubAgentTriggers['onTurnComplete']): SubAgentDefinition<SummarizerApi> {
  return defineSubAgent(SUMMARIZER, () => ({ api: api as SummarizerApi, triggers: { onTurnComplete } }));
}

export function installNegotiator(api: Partial<NegotiatorApi>): SubAgentRegistry {
  return makeSubAgentRegistry([stubNegotiator(api)], { install: true });
}
