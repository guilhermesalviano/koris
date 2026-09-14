import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseServiceFactory, type IDatabaseService } from '../../src/infrastructure/db-sqlite';
import { SessionManager } from '../../src/services/session-manager';
import { SessionContextFactory } from '../../src/services/agents/session-context';
import { MessageGateway } from '../../src/services/agents/message-gateway';
import { BackgroundDispatcherFactory } from '../../src/services/agents/background-dispatcher';
import { SubAgentRegistry, SubAgentRegistrySingleton } from '../../src/services/agents/sub-agents/registry';
import { defineSubAgent, defineSubAgentKey, type InboundClaim } from '../../src/services/agents/sub-agents/contracts';
import { MessageRepositoryFactory } from '../../src/repositories/message';
import { AuditServiceFactory } from '../../src/services/audit/audit-service';
import { buildAgentRoster } from '../../src/constants/agents';
import * as providers from '../../src/services/providers';
import { applyTestConfigDefaults } from '../helpers/test-config';
import type { ILogger } from '../../src/infrastructure/logger';

interface ScoutApi {
  ask(question: string): Promise<string>;
}

const SCOUT = defineSubAgentKey<ScoutApi>({
  id: 'scout',
  name: 'Scout',
  description: 'Looks things up for contacts.',
  parentId: 'orchestrator',
  messageable: false,
  listed: true,
  role: 'worker',
});

describe('a custom sub-agent plugged into the registry', () => {
  let db: IDatabaseService | undefined;
  let directory: string | undefined;

  afterEach(() => {
    SubAgentRegistrySingleton.setInstance(null);
    db?.close();
    db = undefined;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
    vi.restoreAllMocks();
  });

  it('is listed, scheduled, notified of turns, routes inbound messages and audits its completions under its id', async () => {
    applyTestConfigDefaults();
    directory = mkdtempSync(join(tmpdir(), 'koris-custom-sub-agent-'));
    db = DatabaseServiceFactory.create({ filepath: join(directory, 'test.db'), verbose: false });
    const logger: ILogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const sessionManager = new SessionManager(db);
    const record = vi.fn();
    vi.spyOn(AuditServiceFactory, 'create').mockReturnValue({ record } as never);
    const providerComplete = vi.fn().mockResolvedValue({ kind: 'message', text: 'Opens at 9.' });
    const getAIProvider = vi.spyOn(providers, 'getAIProvider').mockReturnValue({ name: 'fake', complete: providerComplete } as never);

    const schedule = { start: vi.fn(), stop: vi.fn() };
    const onTurnComplete = vi.fn().mockResolvedValue(undefined);
    const registry = new SubAgentRegistry(logger, { db, sessionManager });
    registry.register(defineSubAgent(SCOUT, ({ completion, sessionManager: sessions }) => ({
      api: {
        ask: async (question) => {
          const response = await completion.complete({ messages: [{ role: 'user', content: question }] });
          return response.kind === 'message' ? response.text : '';
        },
      },
      triggers: {
        schedule,
        onTurnComplete,
        routeInbound: async (message): Promise<InboundClaim | null> => {
          if (message.isTrustedSender !== false || !message.text.startsWith('scout:')) return null;
          const session = sessions.getSessionService({ channel: message.channel, peerId: message.originId, kind: 'delegated' }).getSession();
          return {
            sessionId: session.id,
            handle: async ({ messageService }) => {
              messageService.save({ role: 'user', content: message.text });
              messageService.save({ role: 'assistant', content: 'On it.', senderAgentId: SCOUT.id });
              return 'On it.';
            },
          };
        },
      },
    })));
    SubAgentRegistrySingleton.setInstance(registry);

    const mainAgent = { run: vi.fn().mockResolvedValue('Hello from the Orchestrator.') };
    const gateway = new MessageGateway(
      logger, 'whatsapp', db, sessionManager, SessionContextFactory.create(logger, db, sessionManager),
      BackgroundDispatcherFactory.create(logger, db, sessionManager),
      mainAgent as never, { record: vi.fn() } as never, { findAll: vi.fn().mockReturnValue([]) } as never,
    );

    expect(buildAgentRoster(registry.descriptors()).map((agent) => agent.id)).toEqual(['orchestrator', 'scout']);

    registry.startAll();
    expect(schedule.start).toHaveBeenCalledTimes(1);

    expect(await gateway.handle('hello', '111', { isTrustedSender: true })).toBe('Hello from the Orchestrator.');
    await vi.waitFor(() => expect(onTurnComplete).toHaveBeenCalledWith(
      expect.objectContaining({ ask: 'hello', answer: 'Hello from the Orchestrator.', channel: 'whatsapp' }),
    ));

    mainAgent.run.mockClear();
    expect(await gateway.handle('scout: when does the shop open?', '555', { isTrustedSender: false })).toBe('On it.');
    expect(mainAgent.run).not.toHaveBeenCalled();
    const delegated = sessionManager.getSessionService({ channel: 'whatsapp', peerId: '555', kind: 'delegated' }).getSession();
    expect(MessageRepositoryFactory.create(db).getBySessionId(delegated.id).map((m) => [m.role, m.content, m.senderAgentId])).toEqual([
      ['user', 'scout: when does the shop open?', undefined],
      ['assistant', 'On it.', 'scout'],
    ]);

    await expect(registry.get(SCOUT).ask('When does the shop open?')).resolves.toBe('Opens at 9.');
    expect(getAIProvider).toHaveBeenCalledWith(logger, 'worker', { background: true });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'scout', role: 'worker', status: 'success' }));

    registry.stopAll();
    expect(schedule.stop).toHaveBeenCalledTimes(1);
  });
});
