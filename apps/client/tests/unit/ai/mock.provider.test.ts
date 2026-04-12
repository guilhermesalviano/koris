import { describe, it, expect } from 'vitest';
import { MockAIProvider } from '../../../src/ai/providers/mock';

describe('MockAIProvider', () => {
  it('healthCheck() always returns ok with provider detail', async () => {
    const provider = new MockAIProvider();
    const health = await provider.healthCheck();

    expect(health).toEqual({ ok: true, detail: 'mock provider' });
  });
});
