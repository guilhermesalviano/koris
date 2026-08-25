import { describe, expect, it } from 'vitest';
import { redactPromptConstants, toCurlCommand } from './curl';
import { SYSTEM_PROMPT } from '../constants';

describe('toCurlCommand', () => {
  it('builds a minimal GET', () => {
    expect(toCurlCommand({ url: 'http://localhost:11434/api/chat' })).toBe(
      'curl -s http://localhost:11434/api/chat',
    );
  });

  it('adds -X for non-GET methods', () => {
    expect(toCurlCommand({ url: 'https://example.com', method: 'PUT' })).toBe(
      'curl -s -X PUT https://example.com',
    );
  });

  it('does not emit -X GET', () => {
    expect(toCurlCommand({ url: 'https://example.com', method: 'get' })).toBe(
      'curl -s https://example.com',
    );
  });

  it('quotes headers with single quotes', () => {
    expect(
      toCurlCommand({
        url: 'https://example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      }),
    ).toBe(
      "curl -s -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer tok' https://example.com",
    );
  });

  it('adds -d with the exact body', () => {
    expect(
      toCurlCommand({
        url: 'https://example.com',
        method: 'POST',
        data: '{"checked":1,"id":13}',
      }),
    ).toBe("curl -s -X POST -d '{\"checked\":1,\"id\":13}' https://example.com");
  });

  it('escapes single quotes inside values', () => {
    expect(toCurlCommand({ url: 'https://example.com', data: "O'Brien", method: 'POST' })).toBe(
      "curl -s -X POST -d 'O'\\''Brien' https://example.com",
    );
  });

  it('skips empty data', () => {
    expect(toCurlCommand({ url: 'https://example.com', method: 'POST', data: '' })).toBe(
      'curl -s -X POST https://example.com',
    );
  });

  it('includes extra flags in order', () => {
    expect(
      toCurlCommand({ url: 'https://example.com', extra: ['-k', '-L'] }),
    ).toBe('curl -s -k -L https://example.com');
  });
});

describe('redactPromptConstants', () => {
  it('replaces SYSTEM_PROMPT text with its variable name', () => {
    const body = JSON.stringify({
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    });
    const out = redactPromptConstants(body);
    expect(out).not.toContain(SYSTEM_PROMPT.slice(0, 50));
    expect(out).toContain('<SYSTEM_PROMPT>');
  });

  it('redacts through the curl -d body', () => {
    const body = JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }] });
    const command = toCurlCommand({ url: 'https://example.com', method: 'POST', data: body });
    expect(command).toContain('<SYSTEM_PROMPT>');
    expect(command).not.toContain('## Participants');
  });

  it('leaves dynamic message content untouched', () => {
    const body = JSON.stringify({
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: 'hello world' }],
    });
    const out = redactPromptConstants(body);
    expect(out).toContain('hello world');
    expect(out).toContain('<SYSTEM_PROMPT>');
  });

  it('returns input unchanged when no constant is present', () => {
    const input = JSON.stringify({ messages: [{ role: 'user', content: 'plain' }] });
    expect(redactPromptConstants(input)).toBe(input);
  });

  it('does not redact arbitrary short strings', () => {
    const input = JSON.stringify({ messages: [{ role: 'user', content: 'short' }] });
    expect(redactPromptConstants(input)).toBe(input);
  });
});
