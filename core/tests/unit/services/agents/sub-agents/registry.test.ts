import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubAgentRegistry } from '../../../../../src/services/agents/sub-agents/registry';
import { defineSubAgent, defineSubAgentKey, type SubAgentServices } from '../../../../../src/services/agents/sub-agents/contracts';
import { sharedSubAgentQueue } from '../../../../../src/services/agents/sub-agents/queue/task-queue';
import { subAgentQueuesRegistry } from '../../../../../src/services/agents/sub-agents/queue/sub-agent-queue-registry';
import * as providers from '../../../../../src/services/providers';
import { config } from '../../../../../src/config';
import type { ILogger } from '../../../../../src/infrastructure/logger';

// The real audit service writes to the app database (memory/database.db).
const { recordAudit } = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock('../../../../../src/services/audit/audit-service', () => ({
  AuditServiceFactory: { create: () => ({ record: recordAudit }) },
}));

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeKey(id: string, overrides: Partial<Parameters<typeof defineSubAgentKey>[0]> = {}) {
  return defineSubAgentKey<{ ping(): string }>({
    id,
    name: id,
    description: `${id} agent`,
    parentId: 'orchestrator',
    messageable: false,
    listed: true,
    role: 'worker',
    ...overrides,
  });
}

const scope = () => ({ db: {} as never, sessionManager: {} as never });

describe('SubAgentRegistry', () => {
  const originalParallel = config.AI.SUBAGENTS_PARALLEL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = originalParallel;
    for (const state of subAgentQueuesRegistry.getSnapshot()) {
      for (const name of state.names) subAgentQueuesRegistry.unregister(name);
    }
    vi.restoreAllMocks();
  });

  it('creates an agent lazily and only once per scope', () => {
    const key = makeKey('alpha');
    const create = vi.fn(() => ({ api: { ping: () => 'pong' } }));
    const registry = new SubAgentRegistry(makeLogger(), scope());
    registry.register(defineSubAgent(key, create));

    expect(create).not.toHaveBeenCalled();
    expect(registry.get(key).ping()).toBe('pong');
    registry.get(key);
    expect(create).toHaveBeenCalledTimes(1);

    const other = scope();
    registry.get(key, other);
    registry.get(key, other);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toMatchObject(other);
  });

  it('rejects a duplicate id and an unregistered key', () => {
    const registry = new SubAgentRegistry(makeLogger(), scope());
    registry.register(defineSubAgent(makeKey('alpha'), () => ({ api: { ping: () => '' } })));

    expect(() => registry.register(defineSubAgent(makeKey('alpha'), () => ({ api: { ping: () => '' } })))).toThrow('already registered');
    expect(() => registry.get(makeKey('missing'))).toThrow('"missing" is not registered');
    expect(registry.has('alpha')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('lists descriptors in registration order', () => {
    const registry = new SubAgentRegistry(makeLogger(), scope());
    registry.register(defineSubAgent(makeKey('beta', { listed: false }), () => ({ api: { ping: () => '' } })));
    registry.register(defineSubAgent(makeKey('alpha', { role: 'manager' }), () => ({ api: { ping: () => '' } })));

    expect(registry.descriptors()).toEqual([
      expect.objectContaining({ id: 'beta', listed: false, role: 'worker' }),
      expect.objectContaining({ id: 'alpha', listed: true, role: 'manager' }),
    ]);
  });

  it.each([
    [false, true],
    [true, false],
  ])('with subagents_parallel=%s the queue is shared=%s and registered once under the agent id', (parallel, shared) => {
    (config.AI as { SUBAGENTS_PARALLEL: boolean }).SUBAGENTS_PARALLEL = parallel;
    const services: SubAgentServices[] = [];
    const registry = new SubAgentRegistry(makeLogger(), scope());
    const register = vi.spyOn(subAgentQueuesRegistry, 'register');
    registry.register(defineSubAgent(makeKey('alpha'), (s) => { services.push(s); return { api: { ping: () => '' } }; }));

    registry.get(makeKey('alpha'));
    registry.get(makeKey('alpha'), scope());

    expect(services).toHaveLength(2);
    expect(services[0].queue).toBe(services[1].queue);
    expect(services[0].queue === sharedSubAgentQueue).toBe(shared);
    expect(register).toHaveBeenCalledExactlyOnceWith('alpha', services[0].queue);
  });

  it('builds the completion service from the descriptor role and audits under the agent id', async () => {
    const complete = vi.fn().mockResolvedValue({ kind: 'message', text: 'ok' });
    const getAIProvider = vi.spyOn(providers, 'getAIProvider').mockReturnValue({ chat: complete, complete } as never);
    let completion: SubAgentServices['completion'] | undefined;
    const registry = new SubAgentRegistry(makeLogger(), scope());
    registry.register(defineSubAgent(makeKey('alpha', { role: 'manager' }), (s) => { completion = s.completion; return { api: { ping: () => '' } }; }));

    registry.get(makeKey('alpha'));
    await completion?.complete({ messages: [] }).catch(() => undefined);

    expect(getAIProvider).toHaveBeenCalledWith(expect.anything(), 'manager', { background: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ role: 'manager', agentName: 'alpha' }));
  });

  it('routes an inbound message to the first sub-agent that claims it', async () => {
    const registry = new SubAgentRegistry(makeLogger(), scope());
    const skip = vi.fn().mockResolvedValue(null);
    const claim = { sessionId: 's1', handle: vi.fn() };
    const first = vi.fn().mockResolvedValue(claim);
    const second = vi.fn().mockResolvedValue({ sessionId: 's2', handle: vi.fn() });
    registry.register(defineSubAgent(makeKey('none'), () => ({ api: { ping: () => '' } })));
    registry.register(defineSubAgent(makeKey('skip'), () => ({ api: { ping: () => '' }, triggers: { routeInbound: skip } })));
    registry.register(defineSubAgent(makeKey('first'), () => ({ api: { ping: () => '' }, triggers: { routeInbound: first } })));
    registry.register(defineSubAgent(makeKey('second'), () => ({ api: { ping: () => '' }, triggers: { routeInbound: second } })));
    const message = { channel: 'whatsapp', originId: '555', text: 'hi', isCommand: false, isTrustedSender: false };

    await expect(registry.routeInbound(message)).resolves.toBe(claim);
    expect(skip).toHaveBeenCalledWith(message);
    expect(second).not.toHaveBeenCalled();
  });

  it('returns null when no sub-agent claims an inbound message', async () => {
    const registry = new SubAgentRegistry(makeLogger(), scope());
    registry.register(defineSubAgent(makeKey('skip'), () => ({ api: { ping: () => '' }, triggers: { routeInbound: async () => null } })));

    await expect(registry.routeInbound({ channel: 'web', originId: 'u', text: 'hi', isCommand: false })).resolves.toBeNull();
  });

  it('notifies every turn listener and isolates a failing one', async () => {
    const logger = makeLogger();
    const registry = new SubAgentRegistry(logger, scope());
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const healthy = vi.fn().mockResolvedValue(undefined);
    registry.register(defineSubAgent(makeKey('failing'), () => ({ api: { ping: () => '' }, triggers: { onTurnComplete: failing } })));
    registry.register(defineSubAgent(makeKey('healthy'), () => ({ api: { ping: () => '' }, triggers: { onTurnComplete: healthy } })));
    const turn = { sessionId: 's', channel: 'web', ask: 'a', answer: 'b', memoryService: {} as never };

    registry.notifyTurnComplete(turn);

    expect(healthy).toHaveBeenCalledWith(turn);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      'Sub-agent "failing" failed to handle a completed turn',
      expect.objectContaining({ err: expect.any(Error) }),
    ));
  });

  it('starts scheduled agents once and stops only the started ones', () => {
    const registry = new SubAgentRegistry(makeLogger(), scope());
    const schedule = { start: vi.fn(), stop: vi.fn() };
    const unscheduled = vi.fn(() => ({ api: { ping: () => '' } }));
    registry.register(defineSubAgent(makeKey('ticker'), () => ({ api: { ping: () => '' }, triggers: { schedule } })));
    registry.register(defineSubAgent(makeKey('idle'), unscheduled));

    registry.stopAll();
    expect(schedule.stop).not.toHaveBeenCalled();

    registry.startAll();
    registry.startAll();
    expect(schedule.start).toHaveBeenCalledTimes(1);

    registry.stopAll();
    registry.stopAll();
    expect(schedule.stop).toHaveBeenCalledTimes(1);
  });
});
