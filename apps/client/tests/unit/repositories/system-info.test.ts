import { describe, expect, it } from 'vitest';
import { SystemInfoRepository } from '../../../src/repositories/system-info';

describe('system info prompt', () => {
  const systemInfoRepository = new SystemInfoRepository();

  it('includes the selected source and runtime context', () => {
    const prompt = systemInfoRepository.loadSystemInfoPrompt({ channel: 'tui' });
    expect(prompt).toContain('source: tui');
    expect(prompt).toContain('cwd:');
    expect(prompt).toContain('node:');
  });
});
