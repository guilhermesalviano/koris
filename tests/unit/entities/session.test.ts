import { describe, it, expect } from 'vitest';
import { Session } from '../../../src/entities/session';

describe('Session entity', () => {
  it('assigns provided id', () => {
    const session = new Session({ id: 'my-id', source: 'tui' });
    expect(session.id).toBe('my-id');
  });

  it('generates uuid when id is omitted', () => {
    const session = new Session({ source: 'tui' });
    expect(session.id).toMatch(/^[0-9a-f]{13}$/);
  });

  it('stores source', () => {
    const session = new Session({ source: 'telegram' });
    expect(session.source).toBe('telegram');
  });

  it('defaults messageCount to 0', () => {
    const session = new Session({ source: 'web' });
    expect(session.messageCount).toBe(0);
  });

  it('stores provided messageCount', () => {
    const session = new Session({ source: 'web', messageCount: 5 });
    expect(session.messageCount).toBe(5);
  });

  it('defaults metadata to empty object', () => {
    const session = new Session({ source: 'tui' });
    expect(session.metadata).toEqual({});
  });

  it('stores provided metadata', () => {
    const session = new Session({ source: 'tui', metadata: { userId: '42' } });
    expect(session.metadata).toEqual({ userId: '42' });
  });

  it('generates ISO startedAt when omitted', () => {
    const session = new Session({ source: 'tui' });
    expect(session.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores provided startedAt', () => {
    const ts = '2024-06-01T10:00:00.000Z';
    const session = new Session({ source: 'tui', startedAt: ts });
    expect(session.startedAt).toBe(ts);
  });

  it('stores endedAt when provided', () => {
    const ts = '2024-06-01T11:00:00.000Z';
    const session = new Session({ source: 'tui', endedAt: ts });
    expect(session.endedAt).toBe(ts);
  });

  it('endedAt is undefined when not provided', () => {
    const session = new Session({ source: 'tui' });
    expect(session.endedAt).toBeUndefined();
  });

  it('two sessions get distinct ids', () => {
    const a = new Session({ source: 'tui' });
    const b = new Session({ source: 'tui' });
    expect(a.id).not.toBe(b.id);
  });
});
