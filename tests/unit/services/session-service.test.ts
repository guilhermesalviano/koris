import { describe, it, expect, vi } from 'vitest';
import { SessionService } from '../../../src/services/session-service';
import { Session } from '../../../src/entities/session';

function makeRepo() {
  return {
    save: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  };
}

describe('SessionService', () => {
  it('persists the session on construction', () => {
    const repo = makeRepo();
    const session = new Session({ source: 'tui' });
    new SessionService(repo as any, session);
    expect(repo.save).toHaveBeenCalledWith(session);
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
});
