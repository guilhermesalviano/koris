import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ILogger } from '../../../src/infrastructure/logger';

const {
  auditRepo,
} = vi.hoisted(() => ({
  auditRepo: {
    count: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteById: vi.fn(),
    deleteAll: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/audit-log', () => ({
  AuditLogRepositoryFactory: { create: () => auditRepo },
}));

vi.mock('../../../src/repositories/session', () => ({
  SessionRepositoryFactory: { create: () => ({}) },
}));

vi.mock('../../../src/repositories/message', () => ({
  MessageRepositoryFactory: { create: () => ({}) },
}));

vi.mock('../../../src/repositories/memory', () => ({
  MemoryRepositoryFactory: { create: () => ({}) },
}));

vi.mock('../../../src/repositories/heartbeat', () => ({
  HeartbeatRepositoryFactory: { create: () => ({}) },
}));

vi.mock('../../../src/repositories/learned-skills', () => ({
  LearnedSkillsRepositoryFactory: { create: () => ({}) },
}));

vi.mock('../../../src/repositories/skills', () => ({
  SkillsRepositoryFactory: { create: () => ({}) },
}));

import { AdminRouterFactory } from '../../../src/dashboard/admin';

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
        kind: 'llm',
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
        kind: 'tool',
        role: 'worker',
        agent_name: 'executorWorker',
        tool_name: 'curl-request',
        duration_ms: 4,
        status: 'error',
        error_message: 'blocked',
        created_at: '2026-01-01T00:01:00.000Z',
      },
      { id: 'a3', kind: 'tool', role: 'worker', agent_name: 'learnerWorker', tool_name: 'get-skill', duration_ms: 2, status: 'success', created_at: '2026-01-01T00:02:00.000Z' },
    ] as never);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit?kind=llm&limit=25', { kind: 'llm', limit: '25' }), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(3);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({
      id: 'a1',
      kind: 'llm',
      agentName: 'manager',
      promptPreview: expect.stringContaining('...'),
      responsePreview: 'hi there',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(auditRepo.findAll).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      filters: expect.objectContaining({ kind: 'llm' }),
    });
    expect(auditRepo.count).toHaveBeenCalledWith(expect.objectContaining({ kind: 'llm' }));
  });

  it('returns a single audit entry by id', () => {
    auditRepo.findById.mockReturnValue({
      id: 'a1',
      kind: 'llm',
      role: 'manager',
      agent_name: 'manager',
      provider: 'ollama',
      model: 'qwen2.5',
      prompt: '{"x":1}',
      response: 'hi',
      duration_ms: 10,
      status: 'success',
      created_at: '2026-01-01T00:00:00.000Z',
    } as never);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit/a1'), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: 'a1', kind: 'llm', status: 'success' });
  });

  it('returns 404 when the audit entry is not found', () => {
    auditRepo.findById.mockReturnValue(null);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('GET', '/audit/missing'), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Audit entry not found' });
  });

  it('deletes a single audit entry', () => {
    auditRepo.deleteById.mockReturnValue(true);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit/a1'), res);

    expect(auditRepo.deleteById).toHaveBeenCalledWith('a1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 404 when deleting a missing audit entry', () => {
    auditRepo.deleteById.mockReturnValue(false);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit/missing'), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('clears all audit entries', () => {
    auditRepo.deleteAll.mockReturnValue(12);

    const router = AdminRouterFactory.create(logger, {} as never);
    const res = makeResponse();
    callRoute(router, makeRequest('DELETE', '/audit'), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, deleted: 12 });
  });
});
