import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService, SessionServiceFactory } from '../../../src/services/session-service';
import { Session } from '../../../src/entities/session';
import { SessionRepositoryFactory } from '../../../src/repositories/session';

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

describe('SessionService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('persists the session on construction by default', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    new SessionService(repo as any, session);
    expect(repo.save).toHaveBeenCalledWith(session);
  });

  it('does not persist when persistOnConstruct is false', () => {
    const repo = makeRepo();
    const session = new Session({ id: 'existing', source: 'tui' });
    new SessionService(repo as any, session, { persistOnConstruct: false });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('getSession returns the initial session', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    const svc = new SessionService(repo as any, session);
    expect(svc.getSession()).toBe(session);
  });

  it('updateCount increments messageCount by 1', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui', messageCount: 2 });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();
    expect(svc.getSession().messageCount).toBe(3);
  });

  it('updateCount persists the updated session via repo.update', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update.mock.calls[0][1].messageCount).toBe(1);
  });

  it('updateCount sets lastActivityAt in metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();

    expect(svc.getSession().metadata.lastActivityAt).toBe('2024-06-01T09:00:00.000-03:00');
  });

  it('updateCount passes original id to repo.update', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();
    expect(repo.update.mock.calls[0][0]).toBe(session.id);
  });

  it('multiple updateCount calls accumulate correctly', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();
    svc.updateCount();
    svc.updateCount();
    expect(svc.getSession().messageCount).toBe(3);
    expect(repo.update).toHaveBeenCalledTimes(3);
  });

  it('preserves session source after updateCount', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'telegram' });
    const svc = new SessionService(repo as any, session);
    svc.updateCount();
    expect(svc.getSession().source).toBe('telegram');
  });

  describe('ensureActiveSession', () => {
    it('returns the same session when not expired', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

      const repo = makeRepo();
      const session = new Session({
        source: 'tui',
        startedAt: '2024-06-01T11:50:00.000Z',
        metadata: { lastActivityAt: '2024-06-01T11:50:00.000Z' },
      });
      const svc = new SessionService(repo as any, session, { persistOnConstruct: false });

      const result = svc.ensureActiveSession();

      expect(result.id).toBe(session.id);
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('ends expired session and creates a new one', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

      const repo = makeRepo();
      const session = new Session({
        id: 'old-session',
        source: 'tui',
        startedAt: '2024-06-01T10:00:00.000Z',
        metadata: { lastActivityAt: '2024-06-01T10:00:00.000Z' },
      });
      const svc = new SessionService(repo as any, session, { persistOnConstruct: false });

      const result = svc.ensureActiveSession();

      expect(repo.update).toHaveBeenCalledWith('old-session', expect.objectContaining({
        endedAt: '2024-06-01T09:00:00.000-03:00',
      }));
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.id).not.toBe('old-session');
      expect(result.source).toBe('tui');
    });
  });
});

describe('SessionServiceFactory', () => {
  beforeEach(() => {
    vi.mocked(SessionRepositoryFactory.create).mockReset();
  });

  it('resumes a non-expired open session without saving it again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

    const existing = new Session({
      id: 'resumed',
      source: 'web',
      startedAt: '2024-06-01T11:50:00.000Z',
      metadata: { lastActivityAt: '2024-06-01T11:50:00.000Z' },
    });

    const repo = makeRepo();
    repo.findLatestOpenBySource.mockReturnValue(existing);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const svc = SessionServiceFactory.create({} as any, 'web');

    expect(svc.getSession().id).toBe('resumed');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('creates a new session when no open session exists', () => {
    const repo = makeRepo();
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const svc = SessionServiceFactory.create({} as any, 'tui');

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(svc.getSession().source).toBe('tui');
  });

  it('creates a new session when the open session is expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));

    const expired = new Session({
      id: 'expired',
      source: 'tui',
      startedAt: '2024-06-01T09:00:00.000Z',
      metadata: { lastActivityAt: '2024-06-01T09:00:00.000Z' },
    });

    const repo = makeRepo();
    repo.findLatestOpenBySource.mockReturnValue(expired);
    vi.mocked(SessionRepositoryFactory.create).mockReturnValue(repo as any);

    const svc = SessionServiceFactory.create({} as any, 'tui');

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(svc.getSession().id).not.toBe('expired');
  });
});
