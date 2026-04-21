import { describe, expect, it } from 'vitest';
import { sanitizeLogText, sanitizeMeta } from '../../../src/utils/sanitize-log-text';

describe('sanitizeLogText', () => {
  it('escapes CR and LF to visible sequences', () => {
    expect(sanitizeLogText('line1\r\nline2\nline3\rline4')).toBe('line1\\r\\nline2\\nline3\\rline4');
  });

  it('removes forbidden control characters', () => {
    const input = `a${String.fromCharCode(0)}b${String.fromCharCode(7)}c${String.fromCharCode(31)}d${String.fromCharCode(127)}e`;
    expect(sanitizeLogText(input)).toBe('abcde');
  });

  it('keeps regular printable content unchanged', () => {
    expect(sanitizeLogText('plain text 123 !?')).toBe('plain text 123 !?');
  });
});

describe('sanitizeMeta', () => {
  it('returns undefined when meta is not provided', () => {
    expect(sanitizeMeta(undefined)).toBeUndefined();
  });

  it('sanitizes string fields recursively', () => {
    const meta = {
      message: 'hello\nworld',
      nested: { note: 'a\rb' },
      list: ['x\ny', 1, true],
    };

    expect(sanitizeMeta(meta)).toEqual({
      message: 'hello\\nworld',
      nested: { note: 'a\\rb' },
      list: ['x\\ny', 1, true],
    });
  });

  it('sanitizes Error objects', () => {
    const err = new Error('bad\nnews');
    err.name = 'Oops\rError';

    const out = sanitizeMeta({ err }) as { err: { name: string; message: string; stack?: string } };

    expect(out.err.name).toBe('Oops\\rError');
    expect(out.err.message).toBe('bad\\nnews');
    expect(typeof out.err.stack === 'string' || out.err.stack === undefined).toBe(true);
  });

  it('replaces circular references with [Circular]', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;

    expect(sanitizeMeta({ node })).toEqual({
      node: {
        name: 'root',
        self: '[Circular]',
      },
    });
  });

  it('stringifies unsupported primitive-like values safely', () => {
    const out = sanitizeMeta({ value: Symbol('x') }) as { value: string };
    expect(out.value).toContain('Symbol(x)');
  });
});
