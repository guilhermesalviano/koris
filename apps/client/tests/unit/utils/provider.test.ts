import { describe, expect, it } from 'vitest';
import { validateBaseUrl } from '../../../src/utils/provider';

describe('validateBaseUrl', () => {
  it('throws for invalid URL', () => {
    expect(() => validateBaseUrl('not-a-url', false)).toThrow('Invalid AI base URL: not-a-url');
  });

  it('throws for unsupported protocol', () => {
    expect(() => validateBaseUrl('ftp://localhost:11434', false)).toThrow('Unsupported AI base URL protocol: ftp:');
  });

  it('throws when URL includes credentials', () => {
    expect(() => validateBaseUrl('http://user:pass@localhost:11434', false)).toThrow(
      'AI base URL must not include credentials',
    );
  });

  it('allows localhost when remote is disallowed', () => {
    expect(validateBaseUrl('http://localhost:11434', false)).toBe('http://localhost:11434');
  });

  it('allows IPv4 loopback when remote is disallowed', () => {
    expect(validateBaseUrl('http://127.0.0.1:11434', false)).toBe('http://127.0.0.1:11434');
  });

  it('allows IPv6 loopback when remote is disallowed', () => {
    expect(validateBaseUrl('http://[::1]:11434', false)).toBe('http://[::1]:11434');
  });

  it('blocks remote hosts when allowRemote=false', () => {
    expect(() => validateBaseUrl('https://api.example.com/v1/chat', false)).toThrow(
      'Blocked remote AI base URL: https://api.example.com. Set AI_ALLOW_REMOTE_BASE_URL=true only if remote transmission is intended.',
    );
  });

  it('allows remote hosts when allowRemote=true', () => {
    expect(validateBaseUrl('https://api.example.com/v1/chat', true)).toBe('https://api.example.com');
  });

  it('returns origin only (drops path/query/hash)', () => {
    expect(validateBaseUrl('https://example.com/path?q=1#x', true)).toBe('https://example.com');
  });
});
