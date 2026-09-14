import { config } from '../../../config';
import type { ILogger } from '../../../infrastructure/logger';
import { PromptRepositoryFactory } from '../../../repositories/prompt';
import { AICompletionService, IAICompletionService } from '../../ai-completion-service';
import { getAIProvider } from '../../providers';
import { TaskQueue, sharedSubAgentQueue } from './queue/task-queue';
import { subAgentQueuesRegistry } from './queue/sub-agent-queue-registry';
import type {
  CompletedTurn,
  InboundClaim,
  InboundPeerMessage,
  SubAgentDefinition,
  SubAgentDescriptor,
  SubAgentInstance,
  SubAgentKey,
  SubAgentScope,
  SubAgentServices,
} from './contracts';

interface ISubAgentRegistry {
  register(definition: SubAgentDefinition): void;
  has(id: string): boolean;
  get<TApi extends object>(key: SubAgentKey<TApi>, scope?: SubAgentScope): TApi;
  descriptors(): SubAgentDescriptor[];
  startAll(): void;
  stopAll(): void;
  notifyTurnComplete(turn: CompletedTurn, scope?: SubAgentScope): void;
  routeInbound(message: InboundPeerMessage, scope?: SubAgentScope): Promise<InboundClaim | null>;
}

interface SubAgentRegistryOptions {
  createQueue?: (definition: SubAgentDefinition) => TaskQueue;
  createCompletion?: (definition: SubAgentDefinition, logger: ILogger) => IAICompletionService;
}

function defaultQueue(): TaskQueue {
  return config.AI.SUBAGENTS_PARALLEL ? new TaskQueue(1) : sharedSubAgentQueue;
}

function defaultCompletion(definition: SubAgentDefinition, logger: ILogger): IAICompletionService {
  const { id, role } = definition.key;
  return new AICompletionService(
    () => getAIProvider(logger, role, { background: true }),
    logger,
    { role, agentName: id },
  );
}

class SubAgentRegistry implements ISubAgentRegistry {
  private readonly definitions = new Map<string, SubAgentDefinition>();
  private readonly queues = new Map<string, TaskQueue>();
  private readonly completions = new Map<string, IAICompletionService>();
  private readonly instances = new WeakMap<object, Map<string, SubAgentInstance<object>>>();
  private readonly started = new Set<string>();

  constructor(
    private readonly logger: ILogger,
    private readonly defaultScope: SubAgentScope,
    private readonly options: SubAgentRegistryOptions = {},
  ) {}

  register(definition: SubAgentDefinition): void {
    const { id } = definition.key;
    if (this.definitions.has(id)) {
      throw new Error(`Sub-agent "${id}" is already registered.`);
    }
    this.definitions.set(id, definition);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get<TApi extends object>(key: SubAgentKey<TApi>, scope?: SubAgentScope): TApi {
    return this.instance(this.definition(key.id), scope).api as TApi;
  }

  descriptors(): SubAgentDescriptor[] {
    return Array.from(this.definitions.values(), ({ key }) => ({
      id: key.id,
      name: key.name,
      description: key.description,
      parentId: key.parentId,
      messageable: key.messageable,
      listed: key.listed,
      role: key.role,
    }));
  }

  startAll(): void {
    for (const definition of this.definitions.values()) {
      const schedule = this.instance(definition).triggers?.schedule;
      if (!schedule || this.started.has(definition.key.id)) continue;
      schedule.start();
      this.started.add(definition.key.id);
    }
  }

  stopAll(): void {
    for (const definition of this.definitions.values()) {
      if (!this.started.has(definition.key.id)) continue;
      this.instance(definition).triggers?.schedule?.stop();
      this.started.delete(definition.key.id);
    }
  }

  notifyTurnComplete(turn: CompletedTurn, scope?: SubAgentScope): void {
    for (const definition of this.definitions.values()) {
      const onTurnComplete = this.instance(definition, scope).triggers?.onTurnComplete;
      if (!onTurnComplete) continue;
      onTurnComplete(turn).catch((err: unknown) =>
        this.logger.error(`Sub-agent "${definition.key.id}" failed to handle a completed turn`, { err }),
      );
    }
  }

  async routeInbound(message: InboundPeerMessage, scope?: SubAgentScope): Promise<InboundClaim | null> {
    for (const definition of this.definitions.values()) {
      const routeInbound = this.instance(definition, scope).triggers?.routeInbound;
      if (!routeInbound) continue;
      const claim = await routeInbound(message);
      if (claim) return claim;
    }
    return null;
  }

  private definition(id: string): SubAgentDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Sub-agent "${id}" is not registered.`);
    }
    return definition;
  }

  private instance(definition: SubAgentDefinition, scope: SubAgentScope = this.defaultScope): SubAgentInstance<object> {
    let byId = this.instances.get(scope.sessionManager);
    if (!byId) {
      byId = new Map();
      this.instances.set(scope.sessionManager, byId);
    }

    const { id } = definition.key;
    const existing = byId.get(id);
    if (existing) return existing;

    const created = definition.create(this.services(definition, scope));
    byId.set(id, created);
    return created;
  }

  private services(definition: SubAgentDefinition, scope: SubAgentScope): SubAgentServices {
    const { id } = definition.key;

    let queue = this.queues.get(id);
    if (!queue) {
      queue = this.options.createQueue?.(definition) ?? defaultQueue();
      this.queues.set(id, queue);
      subAgentQueuesRegistry.register(id, queue);
    }

    let completion = this.completions.get(id);
    if (!completion) {
      completion = this.options.createCompletion?.(definition, this.logger) ?? defaultCompletion(definition, this.logger);
      this.completions.set(id, completion);
    }

    const logger = this.logger;
    return {
      logger,
      db: scope.db,
      sessionManager: scope.sessionManager,
      queue,
      completion,
      createPromptRepository: () => PromptRepositoryFactory.create(scope.db, logger, getAIProvider(logger, 'embed')),
    };
  }
}

class SubAgentRegistrySingleton {
  private static instance: SubAgentRegistry | null = null;

  static getInstance(logger: ILogger, scope: SubAgentScope, definitions: readonly SubAgentDefinition[] = []): SubAgentRegistry {
    if (!SubAgentRegistrySingleton.instance) {
      const registry = new SubAgentRegistry(logger, scope);
      for (const definition of definitions) registry.register(definition);
      SubAgentRegistrySingleton.instance = registry;
    }
    return SubAgentRegistrySingleton.instance;
  }

  static getExistingInstance(): SubAgentRegistry | null {
    return SubAgentRegistrySingleton.instance;
  }

  static require(): SubAgentRegistry {
    const registry = SubAgentRegistrySingleton.instance;
    if (!registry) {
      throw new Error('Sub-agents are not available: the sub-agent registry has not been created.');
    }
    return registry;
  }

  static setInstance(registry: SubAgentRegistry | null): void {
    SubAgentRegistrySingleton.instance = registry;
  }
}

export { ISubAgentRegistry, SubAgentRegistry, SubAgentRegistryOptions, SubAgentRegistrySingleton };
