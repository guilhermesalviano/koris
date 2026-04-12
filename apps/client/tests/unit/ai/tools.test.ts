import { describe, expect, it } from 'vitest';
import { loadAITools } from '../../../src/ai/tools';

describe('AI tools loader', () => {
  it('returns the default toolset', () => {
    const tools = loadAITools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((tool) => tool.function.name === 'read_file')).toBe(true);
    expect(tools.some((tool) => tool.function.name === 'execute_command')).toBe(true);
  });

  it('returns a fresh copy on each call', () => {
    const first = loadAITools();
    const second = loadAITools();

    first[0].function.parameters = { changed: true };
    expect(second[0].function.parameters).not.toEqual({ changed: true });
  });
});
