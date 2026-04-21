import { describe, it, expect } from 'vitest';
import { isAbortError, escapeTelegramMarkdown } from '../../../src/utils/telegram';

describe('isAbortError', () => {
  it('returns true for AbortError by name', () => {
    const err = new Error('operation failed');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns true when message contains "aborted"', () => {
    expect(isAbortError(new Error('Request aborted'))).toBe(true);
  });

  it('returns true for case-insensitive "ABORTED"', () => {
    expect(isAbortError(new Error('ABORTED by client'))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isAbortError(new Error('network timeout'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isAbortError('aborted')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});

describe('escapeTelegramMarkdown', () => {
  it('escapes dots', () => {
    expect(escapeTelegramMarkdown('hello.world')).toBe('hello\\.world');
  });

  it('escapes hyphens', () => {
    expect(escapeTelegramMarkdown('step-by-step')).toBe('step\\-by\\-step');
  });

  it('escapes backslashes', () => {
    expect(escapeTelegramMarkdown('back\\slash')).toBe('back\\\\slash');
  });

  it('escapes multiple special characters', () => {
    expect(escapeTelegramMarkdown('v1.0-beta')).toBe('v1\\.0\\-beta');
  });

  it('returns plain text unchanged', () => {
    expect(escapeTelegramMarkdown('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeTelegramMarkdown('')).toBe('');
  });
});
