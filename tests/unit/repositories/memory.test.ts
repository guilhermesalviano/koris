import { describe, it, expect, vi } from 'vitest';
import { MemoryRepository } from '../../../src/repositories/memory';
import { Memory } from '../../../src/entities/memory';
import { formatISO } from '../../../src/utils/date';

function makeDb(rows: any[] = []) {
  return { run: vi.fn(), query: vi.fn().mockReturnValue(rows), get: vi.fn() };
}

function makeMemory() {
  return new Memory({
    id: 'm1',
    sessionId: 'sess-1',
    source: 'tui',
    type: 'fact',
    content: 'hello',
    embedding: [0.1, 0.2],
    tags: 'important',
    importance: 3,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('MemoryRepository', () => {
  it('save inserts the memory with JSON-encoded embedding', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);
    const memory = makeMemory();

    repository.save(memory);

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO memories');
    expect(params).toEqual([
      'm1',
      'sess-1',
      'tui',
      'fact',
      'hello',
      '[0.1,0.2]',
      'important',
      3,
      formatISO(memory.createdAt),
    ]);
  });

  it('save stores null embedding when not provided', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);
    const memory = new Memory({ sessionId: 's1', source: 'tui', type: 'fact', content: 'x' });

    repository.save(memory);

    expect(db.run.mock.calls[0][1][5]).toBeNull();
  });

  it('update writes the memory columns keyed by id', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);

    repository.update(makeMemory());

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('UPDATE memories');
    expect(params[params.length - 1]).toBe('m1');
  });

  it('getAll maps rows back into Memory entities', () => {
    const db = makeDb([
      {
        id: 'm1',
        session_id: 'sess-1',
        source: 'tui',
        type: 'fact',
        content: 'hello',
        embedding: '[0.1,0.2]',
        tags: 'x',
        importance: 3,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const repository = new MemoryRepository(db as never);

    const memories = repository.getAll();

    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('m1');
    expect(memories[0].embedding).toEqual([0.1, 0.2]);
    expect(memories[0].tags).toBe('x');
    expect(memories[0].importance).toBe(3);
    expect(memories[0].createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('SELECT id, session_id, source, type, content, embedding, tags, importance, created_at FROM memories');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([]);
  });

  it('save stores tags and importance as-is when present', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);

    repository.save(makeMemory());

    const params = db.run.mock.calls[0][1];
    expect(params[6]).toBe('important');
    expect(params[7]).toBe(3);
  });

  it('update stores tags and importance as-is when present', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);

    repository.update(makeMemory());

    const params = db.run.mock.calls[0][1];
    expect(params[3]).toBe('important');
    expect(params[4]).toBe(3);
  });

  it('getAll filters by excluded session id', () => {
    const db = makeDb([]);
    const repository = new MemoryRepository(db as never);

    repository.getAll('sess-1');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE session_id != ?');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual(['sess-1']);
  });

  it('getBySessionId queries by session id', () => {
    const db = makeDb([]);
    const repository = new MemoryRepository(db as never);

    repository.getBySessionId('sess-1');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE session_id = ?');
    expect(params).toEqual(['sess-1']);
  });

  it('search ranks memories by cosine similarity and limits results', () => {
    const db = makeDb([
      { id: 'm1', session_id: 's', source: 'tui', type: 'fact', content: 'a', embedding: '[1,0]', created_at: '2026-01-01' },
      { id: 'm2', session_id: 's', source: 'tui', type: 'fact', content: 'b', embedding: '[0.5,0.5]', created_at: '2026-01-02' },
      { id: 'm3', session_id: 's', source: 'tui', type: 'fact', content: 'c', embedding: '[-1,0]', created_at: '2026-01-03' },
    ]);
    const repository = new MemoryRepository(db as never);

    const result = repository.search([1, 0], 2);

    expect(result.map((memory) => memory.id)).toEqual(['m1', 'm2']);
  });

  it('search returns the highest-scoring memories regardless of row order', () => {
    const db = makeDb([
      { id: 'm_low', session_id: 's', source: 'tui', type: 'fact', content: 'c', embedding: '[-1,0]', created_at: '2026-01-01' },
      { id: 'm_top', session_id: 's', source: 'tui', type: 'fact', content: 'a', embedding: '[1,0]', created_at: '2026-01-02' },
      { id: 'm_mid', session_id: 's', source: 'tui', type: 'fact', content: 'b', embedding: '[0.5,0.5]', created_at: '2026-01-03' },
    ]);
    const repository = new MemoryRepository(db as never);

    const result = repository.search([1, 0], 2);

    expect(result.map((memory) => memory.id)).toEqual(['m_top', 'm_mid']);
  });

  it('search excludes rows without embeddings when mixed with embedded rows', () => {
    const db = makeDb([
      { id: 'm1', session_id: 's', source: 'tui', type: 'fact', content: 'a', embedding: '[1,0]', created_at: '2026-01-01' },
      { id: 'm2', session_id: 's', source: 'tui', type: 'fact', content: 'b', created_at: '2026-01-02' },
    ]);
    const repository = new MemoryRepository(db as never);

    const result = repository.search([1, 0], 5);

    expect(result.map((memory) => memory.id)).toEqual(['m1']);
  });

  it('search ignores memories without embeddings', () => {
    const db = makeDb([
      { id: 'm1', session_id: 's', source: 'tui', type: 'fact', content: 'a', created_at: '2026-01-01' },
    ]);
    const repository = new MemoryRepository(db as never);

    const result = repository.search([1, 0], 5);

    expect(result).toEqual([]);
  });

  it('deleteById deletes a single memory', () => {
    const db = makeDb();
    const repository = new MemoryRepository(db as never);

    repository.deleteById('m1');

    expect(db.run).toHaveBeenCalledWith('DELETE FROM memories WHERE id = ?', ['m1']);
  });
});
