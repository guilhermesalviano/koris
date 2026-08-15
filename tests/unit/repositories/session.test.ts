import { describe, it, expect, vi } from 'vitest';
import { SessionRepository, SessionRepositoryFactory } from '../../../src/repositories/session';
import { Session } from '../../../src/entities/session';

function makeDb() {
  return { run: vi.fn(), get: vi.fn() };
}

describe('SessionRepository', () => {
  it('save inserts the session with JSON-encoded metadata', () => {
    const db = makeDb();
    const repository = new SessionRepository(db as never);
    const session = new Session({ id: 's1', entryChannel: 'tui', metadata: { foo: 1 } });

    repository.save(session);

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO sessions');
    expect(params).toEqual(['s1', 'tui', session.startedAt, undefined, 0, '{"foo":1}']);
  });

  it('update maps camelCase keys to snake_case and JSON-encodes objects', () => {
    const db = makeDb();
    const repository = new SessionRepository(db as never);

    repository.update('s1', { messageCount: 5, metadata: { k: 'v' }, entryChannel: 'web' });

    const [sql, values] = db.run.mock.calls[0];
    expect(sql).toBe('UPDATE sessions SET message_count = ?, metadata = ?, entry_channel = ? WHERE id = ?');
    expect(values).toEqual([5, '{"k":"v"}', 'web', 's1']);
  });

  it('update does nothing when there are no updates', () => {
    const db = makeDb();
    const repository = new SessionRepository(db as never);

    repository.update('s1', {});

    expect(db.run).not.toHaveBeenCalled();
  });

  it('findById maps the row into a Session', () => {
    const db = makeDb();
    db.get.mockReturnValue({
      id: 's1',
      entry_channel: 'tui',
      started_at: '2026-01-01',
      metadata: '{"k":"v"}',
    });
    const repository = new SessionRepository(db as never);

    const session = repository.findById('s1');

    expect(session).not.toBeNull();
    expect(session?.id).toBe('s1');
    expect(session?.entryChannel).toBe('tui');
    expect(session?.metadata).toEqual({ k: 'v' });
  });

  it('findById returns null when no row is found', () => {
    const db = makeDb();
    db.get.mockReturnValue(undefined);
    const repository = new SessionRepository(db as never);

    expect(repository.findById('nope')).toBeNull();
  });

  it('findById tolerates invalid JSON metadata', () => {
    const db = makeDb();
    db.get.mockReturnValue({ id: 's1', entry_channel: 'tui', metadata: 'not-json' });
    const repository = new SessionRepository(db as never);

    const session = repository.findById('s1');

    expect(session?.metadata).toEqual({});
  });

  it('findById keeps metadata empty when the row has none', () => {
    const db = makeDb();
    db.get.mockReturnValue({ id: 's1', entry_channel: 'tui' });
    const repository = new SessionRepository(db as never);

    const session = repository.findById('s1');

    expect(session?.metadata).toEqual({});
  });

  it('findById keeps metadata empty when the row metadata is null', () => {
    const db = makeDb();
    db.get.mockReturnValue({ id: 's1', entry_channel: 'tui', metadata: null });
    const repository = new SessionRepository(db as never);

    const session = repository.findById('s1');

    expect(session?.metadata).toEqual({});
  });

  it('findLatestOpenByEntryChannel queries for open sessions most recent first', () => {
    const db = makeDb();
    db.get.mockReturnValue({ id: 's1', entry_channel: 'tui' });
    const repository = new SessionRepository(db as never);

    repository.findLatestOpenByEntryChannel('tui');

    const [sql, params] = db.get.mock.calls[0];
    expect(sql).toContain('ended_at IS NULL');
    expect(sql).toContain('ORDER BY started_at DESC');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['tui']);
  });

  it('findLatestOpenByEntryChannel returns null when no row is found', () => {
    const db = makeDb();
    db.get.mockReturnValue(undefined);
    const repository = new SessionRepository(db as never);

    expect(repository.findLatestOpenByEntryChannel('tui')).toBeNull();
  });

  it('findLatestOpenByEntryChannel returns the mapped session when a row is found', () => {
    const db = makeDb();
    db.get.mockReturnValue({ id: 's1', entry_channel: 'tui', metadata: '{"k":"v"}' });
    const repository = new SessionRepository(db as never);

    const session = repository.findLatestOpenByEntryChannel('tui');

    expect(session).not.toBeNull();
    expect(session?.id).toBe('s1');
    expect(session?.metadata).toEqual({ k: 'v' });
  });

  it('deleteExpired deletes rows that ended before now', () => {
    const db = makeDb();
    const repository = new SessionRepository(db as never);

    repository.deleteExpired();

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('DELETE FROM sessions');
    expect(sql).toContain('ended_at < ?');
    expect(params.length).toBe(1);
  });

  it('deleteById deletes a single session', () => {
    const db = makeDb();
    const repository = new SessionRepository(db as never);

    repository.deleteById('s1');

    expect(db.run).toHaveBeenCalledWith('DELETE FROM sessions WHERE id = ?', ['s1']);
  });

  it('factory create returns a SessionRepository bound to the db', () => {
    const db = makeDb();
    const repository = SessionRepositoryFactory.create(db as never);

    expect(repository).toBeInstanceOf(SessionRepository);
    repository.findById('s1');
    expect(db.get).toHaveBeenCalledWith('SELECT * FROM sessions WHERE id = ?', ['s1']);
  });
});
