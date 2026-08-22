import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ILogger } from '../../../src/infrastructure/logger';

const {
  auditRepo,
  sessionRepo,
  messageRepo,
  memoryRepo,
  heartbeatRepo,
  channelRepo,
  outboundRepo,
  learnedSkillsRepo,
  skillsRepo,
  skillSync,
  settingsWriter,
  liveChannelRuntime,
} = vi.hoisted(() => ({
  auditRepo: {
    count: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteById: vi.fn(),
    deleteAll: vi.fn(),
    usage: vi.fn(),
  },
  sessionRepo: { count: vi.fn(), countOpen: vi.fn() },
  messageRepo: { count: vi.fn() },
  memoryRepo: { count: vi.fn() },
  heartbeatRepo: { getAll: vi.fn() },
  channelRepo: { getAll: vi.fn() },
  outboundRepo: {
    count: vi.fn(),
    save: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  },
  learnedSkillsRepo: { count: vi.fn(), getAll: vi.fn(), getByName: vi.fn(), setEnabled: vi.fn() },
  skillsRepo: { get: vi.fn() },
  skillSync: { sync: vi.fn(), getExistingInstance: vi.fn() },
  settingsWriter: {
    loadCurrentOrExampleSettings: vi.fn(() => ({})),
    mergeSettingsPayload: vi.fn((base: object, patch: object) => ({ ...base, ...patch })),
    writeSettingsFile: vi.fn(() => '/tmp/settings.json'),
  },
  liveChannelRuntime: {
    startWhatsAppLive: vi.fn(),
    startTelegramLive: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/audit-log', () => ({
  AuditLogRepositoryFactory: { create: () => auditRepo },
}));

vi.mock('../../../src/repositories/session', () => ({
  SessionRepositoryFactory: { create: () => sessionRepo },
}));

vi.mock('../../../src/repositories/message', () => ({
  MessageRepositoryFactory: { create: () => messageRepo },
}));

vi.mock('../../../src/repositories/memory', () => ({
  MemoryRepositoryFactory: { create: () => memoryRepo },
}));

vi.mock('../../../src/repositories/heartbeat', () => ({
  HeartbeatRepositoryFactory: { create: () => heartbeatRepo },
}));

vi.mock('../../../src/repositories/channel', () => ({
  ChannelRepositoryFactory: { create: () => channelRepo },
}));

vi.mock('../../../src/repositories/outbound-message', () => ({
  OutboundMessageRepositoryFactory: { create: () => outboundRepo },
}));

vi.mock('../../../src/repositories/learned-skills', () => ({
  LearnedSkillsRepositoryFactory: { create: () => learnedSkillsRepo },
}));

vi.mock('../../../src/repositories/skills', () => ({
  SkillsRepositoryFactory: { create: () => skillsRepo },
}));

vi.mock('../../../src/services/skills/skill-sync', () => ({
  SkillSyncSingleton: skillSync,
}));

vi.mock('../../../src/config/settings-writer', () => settingsWriter);

vi.mock('../../../src/dashboard/live-channel-runtime', () => liveChannelRuntime);

import { AdminRouterFactory } from '../../../src/dashboard/admin';
import { config } from '../../../src/config';

function makeResponse(): Response {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function makeRequest(method: string, url: string, query: Record<string, string> = {}): Request {
  return {
    method,
    url,
    query,
    params: {},
    body: {},
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

function callRoute(router: ReturnType<typeof AdminRouterFactory.create>, req: Request, res: Response): void {
  router.handle(req, res, () => {});
}

const logger: ILogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

describe('AdminRouterFactory /audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists audit entries with pagination and forwards filters', () => {
    auditRepo.count.mockReturnValue(3);
    auditRepo.findAll.mockReturnValue([
      {
        id: 'a1',
        type: 'llm',
        role: 'manager',
        agent_name: 'manager',
        provider: 'ollama',
        model: 'qwen2.5',
        prompt: '{"messages":"..."}',
        response: 'hi there',
        duration_ms: 10,
        status: 'success',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'a2',
        type: 'tool',
        role: 'worker',
        agent_name: 'executorWorker',
        tool_name: 'curl-request',
        duration_ms: 4,
        status: 'error',
        error_message: 'blocked',
        created_at: '2026-01-01T00:01:00.000Z',
      },
      { id: 'a3', type: 'tool', role: 'worker', agent_name: 'executorWorker', tool_name: 'search_engine', duration_ms: 2, status: 'success', created_at: '2026-01-01T00:02:00.000Z' },
    ] as never);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit?type=llm&limit=25', { type: 'llm', limit: '25' }), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(3);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({
      id: 'a1',
      type: 'llm',
      agentName: 'manager',
      promptPreview: expect.stringContaining('...'),
      responsePreview: 'hi there',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(auditRepo.findAll).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      filters: expect.objectContaining({ type: 'llm' }),
    });
    expect(auditRepo.count).toHaveBeenCalledWith(expect.objectContaining({ type: 'llm' }));
  });

  it('returns a single audit entry by id', () => {
    auditRepo.findById.mockReturnValue({
      id: 'a1',
      type: 'llm',
      role: 'manager',
      agent_name: 'manager',
      provider: 'ollama',
      model: 'qwen2.5',
      prompt: '{"x":1}',
      response: 'hi',
      duration_ms: 10,
      status: 'success',
      tools_enabled: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    } as never);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit/a1'), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: 'a1', type: 'llm', status: 'success', toolsEnabled: true });
  });

  it('returns 404 when the audit entry is not found', () => {
    auditRepo.findById.mockReturnValue(null);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit/missing'), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Audit entry not found' });
  });

  it('deletes a single audit entry', () => {
    auditRepo.deleteById.mockReturnValue(true);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit/a1'), res);

    expect(auditRepo.deleteById).toHaveBeenCalledWith('a1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 404 when deleting a missing audit entry', () => {
    auditRepo.deleteById.mockReturnValue(false);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit/missing'), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('clears all audit entries', () => {
    auditRepo.deleteAll.mockReturnValue(12);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit'), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, deleted: 12 });
  });
});

describe('AdminRouterFactory /queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the serial queue state', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/queue'), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(typeof body.parallel).toBe('boolean');
    expect(typeof body.subagentsParallel).toBe('boolean');
    expect(typeof body.backgroundGraceMs).toBe('number');
    expect(Array.isArray(body.subAgents)).toBe(true);
    expect(Array.isArray(body.running)).toBe(true);
    expect(body.running).toEqual([]);
    expect(body.queued).toEqual([]);
  });
});

describe('AdminRouterFactory /usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a usage report for all-time', () => {
    auditRepo.usage.mockReturnValue([
      { id: 'a1', run_id: 'r1', channel: 'telegram', type: 'llm', role: 'manager', agent_name: 'manager', prompt_length: 40, response_length: 8, duration_ms: 10, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', run_id: 'r1', channel: 'telegram', type: 'tool', role: 'worker', agent_name: 'executorWorker', tool_name: 'curl-request', duration_ms: 4, created_at: '2026-01-01T00:00:10.000Z' },
    ] as never);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/usage'), res);

    expect(auditRepo.usage).toHaveBeenCalledWith({ from: undefined });
    const body = res.json.mock.calls[0][0];
    expect(body.days).toBeNull();
    expect(body.total.calls).toBe(1);
    expect(body.total.toolCalls).toBe(1);
    expect(body.total.totalTokens).toBe(12);
    expect(body.byAgent.manager).toBeDefined();
    expect(body.byChannel.telegram).toBeDefined();
    expect(body.byTool['curl-request']).toBeDefined();
  });

  it('forwards the days filter to the repository', () => {
    auditRepo.usage.mockReturnValue([]);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/usage', { days: '7' }), res);

    const [call] = auditRepo.usage.mock.calls[0];
    expect(call.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.json.mock.calls[0][0].days).toBe(7);
  });

  it('ignores invalid days values', () => {
    auditRepo.usage.mockReturnValue([]);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/usage', { days: 'abc' }), res);

    expect(auditRepo.usage).toHaveBeenCalledWith({ from: undefined });
    expect(res.json.mock.calls[0][0].days).toBeNull();
  });
});

describe('AdminRouterFactory /overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionRepo.count.mockReturnValue(4);
    sessionRepo.countOpen.mockReturnValue(1);
    messageRepo.count.mockReturnValue(42);
    memoryRepo.count.mockReturnValue(7);
    heartbeatRepo.getAll.mockReturnValue([
      { lastRun: new Date('2026-01-02T10:00:00.000Z') },
      { lastRun: new Date('2026-01-03T10:00:00.000Z') },
    ] as never);
    learnedSkillsRepo.count.mockReturnValue(2);
    skillsRepo.get.mockReturnValue([{}, {}, {}] as never);
    outboundRepo.count.mockReturnValue(11);
    channelRepo.getAll.mockReturnValue([
      { channel: 'telegram', target: '@me', isPrincipal: true },
    ] as never);
    auditRepo.count.mockReturnValue(2);
    auditRepo.findAll.mockReturnValue([
      {
        id: 'e1',
        type: 'tool',
        role: 'worker',
        agent_name: 'executorWorker',
        tool_name: 'curl-request',
        duration_ms: 3,
        status: 'error',
        error_message: 'blocked',
        created_at: '2026-01-03T09:00:00.000Z',
      },
    ] as never);
    auditRepo.usage.mockReturnValue([
      { id: 'u1', type: 'llm', agent_name: 'manager', prompt_length: 40, response_length: 8, duration_ms: 10, created_at: '2026-01-01T00:00:00.000Z' },
    ] as never);
  });

  it('returns aggregate counts, config, queue, usage and recent errors', async () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    router.handle(makeRequest('GET', '/overview'), res, () => {});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];

    expect(body.sessions).toBe(4);
    expect(body.openSessions).toBe(1);
    expect(body.messages).toBe(42);
    expect(body.memories).toBe(7);
    expect(body.heartbeats).toBe(2);
    expect(body.learnedSkills).toBe(2);
    expect(body.skills).toBe(3);
    expect(body.outboundMessages).toBe(11);
    expect(body.auditErrors).toBe(2);
    expect(body.lastHeartbeatRunAt).toMatch(/^2026-01-03T/);

    expect(body.workerProvider).toBeDefined();
    expect(body.workerModel).toBeDefined();
    expect(body.heartbeatEnabled).toBeTypeOf('boolean');
    expect(body.summarizerEnabled).toBeTypeOf('boolean');
    expect(body.aiParallel).toBeTypeOf('boolean');
    expect(body.aiSubagentsParallel).toBeTypeOf('boolean');

    expect(body.channels).toEqual([
      { type: 'telegram', enabled: expect.any(Boolean) },
      { type: 'whatsapp', enabled: expect.any(Boolean) },
    ]);
    expect(body.registeredChannels).toEqual([
      { type: 'telegram', target: '@me', principal: true },
    ]);

    expect(body.health.status).toBe('ok');
    expect(body.activeRuns).toEqual([]);
    expect(body.queue).toMatchObject({
      parallel: expect.any(Boolean),
      subagentsParallel: expect.any(Boolean),
      running: [],
      queued: [],
    });
    expect(body.usage.totalTokens).toBeGreaterThan(0);
    expect(body.recentErrors).toHaveLength(1);
    expect(body.recentErrors[0]).toMatchObject({ id: 'e1', status: 'error' });

    expect(auditRepo.count).toHaveBeenCalledWith({ status: 'error' });
    expect(auditRepo.findAll).toHaveBeenCalledWith({
      limit: 5,
      filters: { status: 'error' },
    });
    expect(auditRepo.usage).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String) }));
  });
});

describe('AdminRouterFactory /skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /skills merges disk skills with learned state and the limit', () => {
    skillsRepo.get.mockReturnValue([
      { name: 'git', description: 'Git skill', read_when: ['when needed'], content: 'run rebase' },
      { name: 'docker', description: 'Docker skill', read_when: null, content: 'run compose' },
    ] as never);
    learnedSkillsRepo.getAll.mockReturnValue([
      { name: 'git', enabled: false, learned_at: '2026-01-01 00:00:00' },
    ] as never);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/skills'), res);

    expect(res.json).toHaveBeenCalledWith({
      items: [
        {
          name: 'git',
          description: 'Git skill',
          read_when: ['when needed'],
          content: 'run rebase',
          enabled: false,
          learned_at: '2026-01-01 00:00:00',
        },
        {
          name: 'docker',
          description: 'Docker skill',
          read_when: null,
          content: 'run compose',
          enabled: true,
          learned_at: null,
        },
      ],
      limit: config.LEARNED_SKILLS_LIMIT,
    });
  });

  it('PATCH /skills/:name toggles the enabled flag', () => {
    learnedSkillsRepo.setEnabled.mockReturnValue(true);
    learnedSkillsRepo.getByName.mockReturnValue({ name: 'git', enabled: false });

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('PATCH', '/skills/git');
    req.body = { enabled: false };
    callRoute(router, req, res);

    expect(learnedSkillsRepo.setEnabled).toHaveBeenCalledWith('git', false);
    expect(res.json).toHaveBeenCalledWith({ success: true, skill: { name: 'git', enabled: false } });
  });

  it('PATCH /skills/:name rejects a non-boolean enabled value', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('PATCH', '/skills/git');
    req.body = { enabled: 'yes' };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'enabled must be a boolean' });
    expect(learnedSkillsRepo.setEnabled).not.toHaveBeenCalled();
  });

  it('PATCH /skills/:name returns 404 when the skill is unknown', () => {
    learnedSkillsRepo.setEnabled.mockReturnValue(false);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('PATCH', '/skills/missing');
    req.body = { enabled: true };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Skill not found' });
  });

  it('POST /skills/sync triggers a resync when initialized', () => {
    skillSync.getExistingInstance.mockReturnValue(skillSync);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('POST', '/skills/sync'), res);

    expect(skillSync.sync).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('POST /skills/sync returns 503 when sync is not initialized', () => {
    skillSync.getExistingInstance.mockReturnValue(null);

    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('POST', '/skills/sync'), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Skill sync not initialized' });
    expect(skillSync.sync).not.toHaveBeenCalled();
  });
});

describe('AdminRouterFactory /settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /settings/status reports whether a settings file is configured', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/settings/status'), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(typeof body.configured).toBe('boolean');
  });

  it('GET /capabilities returns the real supported providers and channel types, excluding the internal mock provider', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/capabilities'), res);

    expect(res.json).toHaveBeenCalledWith({
      providers: expect.arrayContaining(['ollama', 'nvidia']),
      channels: expect.arrayContaining(['telegram', 'whatsapp']),
    });
    const body = res.json.mock.calls[0][0];
    expect(body.providers).not.toContain('mock');
  });

  it('POST /settings rejects a non-object body', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = 'nope';
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsWriter.writeSettingsFile).not.toHaveBeenCalled();
  });

  it('POST /settings rejects an out-of-range web_port', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = { web_port: 99999 };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining('web_port')]));
    expect(settingsWriter.writeSettingsFile).not.toHaveBeenCalled();
  });

  it('POST /settings rejects an unsupported AI provider', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = { ai: { manager: { provider: 'anthropic' } } };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining('ai.manager.provider')]));
    expect(settingsWriter.writeSettingsFile).not.toHaveBeenCalled();
  });

  it('POST /settings rejects the internal mock provider', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = { ai: { manager: { provider: 'mock' } } };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining('reserved for internal testing')]));
    expect(settingsWriter.writeSettingsFile).not.toHaveBeenCalled();
  });

  it('POST /settings rejects enabling Telegram without a bot token', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = { channels: { telegram: { enabled: true, bot_token: '' } } };
    callRoute(router, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining('channels.telegram.bot_token')]));
    expect(settingsWriter.writeSettingsFile).not.toHaveBeenCalled();
  });

  it('POST /settings writes a valid patch and reports success', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/settings');
    req.body = { web_port: 4000 };
    callRoute(router, req, res);

    expect(settingsWriter.loadCurrentOrExampleSettings).toHaveBeenCalledTimes(1);
    expect(settingsWriter.mergeSettingsPayload).toHaveBeenCalledWith({}, { web_port: 4000 });
    expect(settingsWriter.writeSettingsFile).toHaveBeenCalledWith({ web_port: 4000 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('POST /ai/test-connection requires a provider and base_url', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('POST', '/ai/test-connection'), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('POST /ai/test-connection skips connectivity checks for the mock provider', async () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    const req = makeRequest('POST', '/ai/test-connection');
    req.body = { provider: 'mock', base_url: 'http://localhost:11434' };
    callRoute(router, req, res);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.json).toHaveBeenCalledWith({ ok: true, skipped: true });
  });

  it('POST /telegram/test-token requires a bot_token', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('POST', '/telegram/test-token'), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('POST /whatsapp/connect triggers a live connection attempt', () => {
    const router = AdminRouterFactory.create(logger, {} as never, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('POST', '/whatsapp/connect'), res);

    expect(liveChannelRuntime.startWhatsAppLive).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
