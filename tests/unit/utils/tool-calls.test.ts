import { describe, it, expect, vi } from 'vitest';
import { extractToolCalls, extractJson, looksLikeToolCallJson, normalizeResponse, shouldSkipToolCall } from '../../../src/utils/tool-calls';
import { Message } from '../../../src/entities/message';
import { ILogger } from '../../../src/infrastructure/logger';

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeMessage(role: 'system' | 'user' | 'assistant', content: string): Message {
  return new Message({ sessionId: 'sess-1', role, content });
}

describe('normalizeResponse', () => {
  it('returns string as-is', () => {
    expect(normalizeResponse('hello')).toBe('hello');
  });

  it('serializes objects to JSON', () => {
    expect(normalizeResponse({ a: 1 })).toBe('{"a":1}');
  });

  it('serializes arrays to JSON', () => {
    expect(normalizeResponse([1, 2])).toBe('[1,2]');
  });

  it('serializes numbers', () => {
    expect(normalizeResponse(42)).toBe('42');
  });

  it('serializes null', () => {
    expect(normalizeResponse(null)).toBe('null');
  });
});

describe('extractJson', () => {
  it('returns pure JSON as-is', () => {
    expect(extractJson('{"tool_calls":[]}')).toBe('{"tool_calls":[]}');
  });

  it('strips markdown json code block', () => {
    const input = '```json\n{"tool_calls":[]}\n```';
    expect(extractJson(input)).toBe('{"tool_calls":[]}');
  });

  it('strips plain markdown code block', () => {
    const input = '```\n{"tool_calls":[]}\n```';
    expect(extractJson(input)).toBe('{"tool_calls":[]}');
  });

  it('extracts JSON embedded in surrounding text', () => {
    const input = 'Sure, I will run this: {"tool_calls":[]} done.';
    expect(extractJson(input)).toBe('{"tool_calls":[]}');
  });

  it('returns null for plain text with no JSON', () => {
    expect(extractJson('just some text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractJson('')).toBeNull();
  });
});

describe('looksLikeToolCallJson', () => {
  it('returns true for text starting with {', () => {
    expect(looksLikeToolCallJson('{"tool_calls":[]}')).toBe(true);
  });

  it('returns true for text starting with ```', () => {
    expect(looksLikeToolCallJson('```json\n{}\n```')).toBe(true);
  });

  it('returns true even with leading whitespace', () => {
    expect(looksLikeToolCallJson('  {"tool_calls":[]}')).toBe(true);
  });

  it('returns false for plain prose', () => {
    expect(looksLikeToolCallJson('The answer is 42')).toBe(false);
  });
});

describe('extractToolCalls', () => {
  it('returns empty array for non-JSON string', () => {
    expect(extractToolCalls('plain text')).toEqual([]);
  });

  it('returns empty array when tool_calls is absent', () => {
    expect(extractToolCalls(JSON.stringify({ message: 'hi' }))).toEqual([]);
  });

  it('returns empty array when tool_calls is not an array', () => {
    expect(extractToolCalls(JSON.stringify({ tool_calls: 'bad' }))).toEqual([]);
  });

  it('parses tool calls with object arguments', () => {
    const payload = {
      tool_calls: [
        { function: { name: 'my_tool', arguments: { key: 'value' } } },
      ],
    };
    const result = extractToolCalls(JSON.stringify(payload));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my_tool');
    expect(result[0].arguments).toEqual({ key: 'value' });
  });

  it('parses tool calls with JSON-string arguments (Ollama format)', () => {
    const payload = {
      tool_calls: [
        { function: { name: 'cmd', arguments: '{"command":"echo hi"}' } },
      ],
    };
    const result = extractToolCalls(JSON.stringify(payload));
    expect(result[0].arguments).toEqual({ command: 'echo hi' });
  });

  it('wraps unparseable string arguments in raw field', () => {
    const payload = {
      tool_calls: [
        { function: { name: 'cmd', arguments: 'not json' } },
      ],
    };
    const result = extractToolCalls(JSON.stringify(payload), mockLogger);
    expect(result[0].arguments).toEqual({ raw: 'not json' });
  });

  it('defaults name to "unknown" when function.name is absent', () => {
    const payload = {
      tool_calls: [{ function: { arguments: {} } }],
    };
    const result = extractToolCalls(JSON.stringify(payload));
    expect(result[0].name).toBe('unknown');
  });

  it('defaults arguments to {} when rawArgs is null', () => {
    const payload = {
      tool_calls: [{ function: { name: 'tool', arguments: null } }],
    };
    const result = extractToolCalls(JSON.stringify(payload), mockLogger);
    expect(result[0].arguments).toEqual({});
  });

  it('keeps valid entries and skips null tool_call items', () => {
    const payload = {
      tool_calls: [
        { function: { name: 'good', arguments: { x: 1 } } },
        null,
      ],
    };
    const result = extractToolCalls(JSON.stringify(payload));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('good');
  });

  it('returns multiple tool calls in order', () => {
    const payload = {
      tool_calls: [
        { function: { name: 'tool_a', arguments: { a: 1 } } },
        { function: { name: 'tool_b', arguments: { b: 2 } } },
      ],
    };
    const result = extractToolCalls(JSON.stringify(payload));
    expect(result).toHaveLength(2);
    expect(result.map(r => r.name)).toEqual(['tool_a', 'tool_b']);
  });

  it('extracts tool calls from markdown-wrapped JSON', () => {
    const payload = { tool_calls: [{ function: { name: 'tool_a', arguments: { a: 1 } } }] };
    const input = '```json\n' + JSON.stringify(payload) + '\n```';
    const result = extractToolCalls(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tool_a');
  });

  it('extracts tool calls from JSON embedded in surrounding text', () => {
    const payload = { tool_calls: [{ function: { name: 'tool_b', arguments: {} } }] };
    const input = 'I will do this now: ' + JSON.stringify(payload) + ' let me know if you need more.';
    const result = extractToolCalls(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('tool_b');
  });
});

describe('shouldSkipToolCall', () => {
  it('returns false for non-get_skill tool calls', () => {
    const tc = { name: 'execute_command', arguments: { command: 'ls' } };
    expect(shouldSkipToolCall(tc, [])).toBe(false);
  });

  it('returns false when skillName is missing', () => {
    const tc = { name: 'get_skill', arguments: {} };
    expect(shouldSkipToolCall(tc, [])).toBe(false);
  });

  it('returns false when skill is not in history', () => {
    const tc = { name: 'get_skill', arguments: { name: 'my-skill' } };
    const history = [makeMessage('user', 'hello')];
    expect(shouldSkipToolCall(tc, history)).toBe(false);
  });

  it('returns true when skill appears in a system message', () => {
    const tc = { name: 'get_skill', arguments: { name: 'my-skill' } };
    const history = [makeMessage('system', 'You have just learned how to use "my-skill" skill.')];
    expect(shouldSkipToolCall(tc, history)).toBe(true);
  });

  it('supports skill_name argument alias', () => {
    const tc = { name: 'get_skill', arguments: { skill_name: 'alias-skill' } };
    const history = [makeMessage('system', 'alias-skill documentation here')];
    expect(shouldSkipToolCall(tc, history)).toBe(true);
  });

  it('returns false when skillName is not a string', () => {
    const tc = { name: 'get_skill', arguments: { name: 123 } };
    expect(shouldSkipToolCall(tc, [])).toBe(false);
  });

  it('does not match skill name in non-system messages', () => {
    const tc = { name: 'get_skill', arguments: { name: 'my-skill' } };
    const history = [makeMessage('user', 'I want to use my-skill')];
    expect(shouldSkipToolCall(tc, history)).toBe(false);
  });
});
