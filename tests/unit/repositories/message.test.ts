import { describe, it, expect, vi } from 'vitest';
import { MessageRepository } from '../../../src/repositories/message';
import { Message } from '../../../src/entities/message';

function makeDb(rows: any[] = []) {
  return {
    query: vi.fn().mockReturnValue(rows),
    get: vi.fn().mockReturnValue(rows[0]),
    run: vi.fn(),
  };
}

describe('MessageRepository', () => {
  it('fetches the latest N messages while returning them in chronological order', () => {
    const db = makeDb([
      {
        id: 'm2',
        session_id: 'sess-1',
        role: 'assistant',
        content: 'second',
        created_at: '2026-05-01T12:00:01.000Z',
      },
      {
        id: 'm3',
        session_id: 'sess-1',
        role: 'user',
        content: 'third',
        created_at: '2026-05-01T12:00:02.000Z',
      },
    ]);
    const repository = new MessageRepository(db as any);

    const messages = repository.getBySessionId('sess-1', 2);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('LIMIT ?');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['sess-1', 2]);
    expect(messages.map((message) => message.id)).toEqual(['m2', 'm3']);
  });

  it('uses the default limit when no limit is provided', () => {
    const db = makeDb([]);
    const repository = new MessageRepository(db as any);

    repository.getBySessionId('sess-1');

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual(['sess-1', 15]);
  });

  it('persists images as a JSON column', () => {
    const db = makeDb([]);
    const repository = new MessageRepository(db as any);

    repository.save(new Message({
      sessionId: 'sess-1',
      role: 'user',
      content: 'describe',
      images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
      id: 'm1',
      createdAt: '2026-05-01T12:00:00.000Z',
    }));

    const [, params] = db.run.mock.calls[0];
    expect(params[4]).toBe(JSON.stringify([{ data: 'aGVsbG8=', mimeType: 'image/png' }]));
  });

  it('stores null images when a message has no attachments', () => {
    const db = makeDb([]);
    const repository = new MessageRepository(db as any);

    repository.save(new Message({
      sessionId: 'sess-1',
      role: 'user',
      content: 'hi',
      id: 'm1',
      createdAt: '2026-05-01T12:00:00.000Z',
    }));

    const [, params] = db.run.mock.calls[0];
    expect(params[4]).toBeNull();
  });

  it('parses images back from the JSON column when reading history', () => {
    const db = makeDb([
      {
        id: 'm1',
        session_id: 'sess-1',
        role: 'user',
        content: 'describe',
        images: JSON.stringify([{ data: 'aGVsbG8=', mimeType: 'image/png' }]),
        created_at: '2026-05-01T12:00:00.000Z',
      },
    ]);
    const repository = new MessageRepository(db as any);

    const [message] = repository.getBySessionId('sess-1', 1);
    expect(message.images).toEqual([{ data: 'aGVsbG8=', mimeType: 'image/png' }]);
  });

  it('fetches the first user message as the session preview', () => {
    const db = makeDb([{ content: 'hello there' }]);
    const repository = new MessageRepository(db as any);

    const preview = repository.getPreviewBySessionId('sess-1');

    const [sql, params] = db.get.mock.calls[0];
    expect(sql).toContain("role = 'user'");
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(params).toEqual(['sess-1']);
    expect(preview).toBe('hello there');
  });

  it('returns null when the session has no user message', () => {
    const db = makeDb([undefined]);
    const repository = new MessageRepository(db as any);

    expect(repository.getPreviewBySessionId('sess-1')).toBeNull();
  });
});
