import { describe, it, expect, vi } from 'vitest';
import { HeartbeatRepository, HeartbeatRepositoryFactory } from '../../../src/repositories/heartbeat';
import { Heartbeat } from '../../../src/entities/heartbeat';
import { formatISO } from '../../../src/utils/date';

function makeDb(rows: any[] = []) {
  return { run: vi.fn(), query: vi.fn().mockReturnValue(rows), get: vi.fn() };
}

function makeHeartbeat() {
  return new Heartbeat({
    id: 'h1',
    task: 'send report',
    type: 'scheduled_task',
    cronExpression: '0 9 * * *',
    lastRun: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2025-12-01T00:00:00Z'),
  });
}

describe('HeartbeatRepository', () => {
  it('save inserts the heartbeat with formatted dates', () => {
    const db = makeDb();
    const repository = new HeartbeatRepository(db as never);
    const heartbeat = makeHeartbeat();

    repository.save(heartbeat);

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO heartbeat');
    expect(params).toEqual([
      'h1',
      'send report',
      'scheduled_task',
      '0 9 * * *',
      formatISO(heartbeat.lastRun as Date),
      formatISO(heartbeat.createdAt),
    ]);
  });

  it('save stores null last_run when not provided', () => {
    const db = makeDb();
    const repository = new HeartbeatRepository(db as never);
    const heartbeat = new Heartbeat({
      task: 't',
      type: 'reminder',
      cronExpression: '0 8 * * *',
    });

    repository.save(heartbeat);

    expect(db.run.mock.calls[0][1][4]).toBeNull();
  });

  it('getById returns null when no row is found', () => {
    const db = makeDb();
    db.get.mockReturnValue(undefined);
    const repository = new HeartbeatRepository(db as never);

    expect(repository.getById('nope')).toBeNull();
    expect(db.get).toHaveBeenCalledWith('SELECT * FROM heartbeat WHERE id = ?', ['nope']);
  });

  it('getById queries with the exact SQL and id', () => {
    const db = makeDb();
    db.get.mockReturnValue({
      id: 'h1',
      task: 't',
      type: 'scheduled_task',
      cron_expression: '0 9 * * *',
      created_at: '2025-12-01T00:00:00.000Z',
    });
    const repository = new HeartbeatRepository(db as never);

    repository.getById('h1');

    expect(db.get).toHaveBeenCalledWith('SELECT * FROM heartbeat WHERE id = ?', ['h1']);
  });

  it('getAll queries with the exact SQL', () => {
    const db = makeDb([]);
    const repository = new HeartbeatRepository(db as never);

    repository.getAll();

    expect(db.query).toHaveBeenCalledWith('SELECT * FROM heartbeat ORDER BY created_at DESC');
  });

  it('getAll maps rows into Heartbeat entities', () => {
    const db = makeDb([
      {
        id: 'h1',
        task: 't',
        type: 'scheduled_task',
        cron_expression: '0 9 * * *',
        last_run: '2026-01-01T00:00:00.000Z',
        created_at: '2025-12-01T00:00:00.000Z',
      },
    ]);
    const repository = new HeartbeatRepository(db as never);

    const items = repository.getAll();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('h1');
    expect(items[0].cronExpression).toBe('0 9 * * *');
    expect(items[0].lastRun).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('update builds the SET clause from provided fields', () => {
    const db = makeDb();
    db.get.mockReturnValue({
      id: 'h1',
      task: 'new',
      type: 'reminder',
      cron_expression: '0 8 * * *',
    });
    const repository = new HeartbeatRepository(db as never);

    repository.update('h1', { task: 'new', cronExpression: '0 8 * * *' });

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toBe('UPDATE heartbeat SET task = ?, cron_expression = ? WHERE id = ?');
    expect(params).toEqual(['new', '0 8 * * *', 'h1']);
  });

  it('update with no fields returns the current row without writing', () => {
    const db = makeDb();
    db.get.mockReturnValue({
      id: 'h1',
      task: 't',
      type: 'reminder',
      cron_expression: '0 9 * * *',
    });
    const repository = new HeartbeatRepository(db as never);

    const result = repository.update('h1', {});

    expect(db.run).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it('updateLastRun updates last_run with a formatted date', () => {
    const db = makeDb();
    const repository = new HeartbeatRepository(db as never);
    const lastRun = new Date('2026-02-01T00:00:00Z');

    repository.updateLastRun('h1', lastRun);

    expect(db.run).toHaveBeenCalledWith(
      'UPDATE heartbeat SET last_run = ? WHERE id = ?',
      [formatISO(lastRun), 'h1'],
    );
  });

  it('deleteById returns whether any row changed', () => {
    const db = makeDb();
    db.run.mockReturnValueOnce({ changes: 1 });
    const repository = new HeartbeatRepository(db as never);

    expect(repository.deleteById('h1')).toBe(true);
    expect(db.run).toHaveBeenCalledWith('DELETE FROM heartbeat WHERE id = ?', ['h1']);

    db.run.mockReturnValueOnce({ changes: 0 });
    expect(repository.deleteById('h2')).toBe(false);
  });

  it('deleteAll returns the number of deleted rows', () => {
    const db = makeDb();
    db.run.mockReturnValue({ changes: 3 });
    const repository = new HeartbeatRepository(db as never);

    expect(repository.deleteAll()).toBe(3);
    expect(db.run).toHaveBeenCalledWith('DELETE FROM heartbeat');
  });

  it('update maps the type field', () => {
    const db = makeDb();
    db.get.mockReturnValue({
      id: 'h1',
      task: 't',
      type: 'scheduled_task',
      cron_expression: '0 9 * * *',
    });
    const repository = new HeartbeatRepository(db as never);

    repository.update('h1', { type: 'reminder' });

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toBe('UPDATE heartbeat SET type = ? WHERE id = ?');
    expect(params).toEqual(['reminder', 'h1']);
  });

  it('factory getInstance throws before create is called', () => {
    expect(() => HeartbeatRepositoryFactory.getInstance()).toThrow('not initialized');
  });

  it('factory getInstance returns the created instance', () => {
    const db = makeDb();
    const instance = HeartbeatRepositoryFactory.create(db as never);

    expect(HeartbeatRepositoryFactory.getInstance()).toBe(instance);
  });
});
