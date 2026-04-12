import { describe, expect, it } from 'vitest';
import { loadSystemInfoPrompt } from '../../../src/ai/system-info';

describe('system info prompt', () => {
  it('includes the selected source and runtime context', () => {
    const prompt = loadSystemInfoPrompt('tui');
    expect(prompt).toContain('source: tui');
    expect(prompt).toContain(`cwd: ${process.cwd()}`);
    expect(prompt).toContain(`node: ${process.version}`);
  });
});
