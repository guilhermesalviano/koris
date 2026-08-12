import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../../../src/services/session-manager';
import { Session } from '../../../src/entities/session';
import { SessionRepositoryFactory } from '../../../src/repositories/session';
import { applyTestConfigDefaults } from '../../helpers/test-config';

vi.mock('../../../src/repositories/session', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/repositories/session')>();
  return {
    ...original,
    SessionRepositoryFactory: {
      create: vi.fn(),
    },
  };
});

function makeRepo() {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findLatestOpenBySource: vi.fn().mockReturnValue(null),
  };
}

describe('SessionManager', () => {
  it('binds getSessionServiceById to the exact session', () => {
    const repo = makeRepo();
    const session = new Session({ id: 'exact-session', source: 'web' });
    repo.findById.mockReturnValue(session);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const manager = new SessionManager({} as any);

    const service = manager.getSessionServiceById('exact-session');

    expect(repo.findById).toHaveBeenCalledWith('exact-session');
    expect(service.getSession().id).toBe('exact-session');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('caches session services by session id', () => {
    const repo = makeRepo();
    const session = new Session({ id: 'cached-session', source: 'web' });
    repo.findById.mockReturnValue(session);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const manager = new SessionManager({} as any);

    const first = manager.getSessionServiceById('cached-session');
    const second = manager.getSessionServiceById('cached-session');

    expect(second).toBe(first);
    expect(repo.findById).toHaveBeenCalledTimes(1);
  });

  it('does not rotate an expired by-id session', () => {
    applyTestConfigDefaults();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

    const repo = makeRepo();
    const session = new Session({
      id: 'stale-session',
      source: 'web',
      startedAt: '2024-06-01T10:00:00.000Z',
      metadata: { lastActivityAt: '2024-06-01T10:00:00.000Z' },
    });
    repo.findById.mockReturnValue(session);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const manager = new SessionManager({} as any);

    const service = manager.getSessionServiceById('stale-session');
    const result = service.ensureActiveSession();

    expect(result.id).toBe('stale-session');
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('throws when the session does not exist', () => {
    const repo = makeRepo();
    repo.findById.mockReturnValue(null);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const manager = new SessionManager({} as any);

    expect(() => manager.getSessionServiceById('missing')).toThrow('Session not found: missing');
  });
});
