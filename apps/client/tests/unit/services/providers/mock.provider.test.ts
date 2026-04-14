import { describe, it, expect } from 'vitest';
import { MockAIProvider } from '../../../../src/services/providers/mock';
import { LoggerFactory } from '../../../../src/infrastructure/logger';

describe('MockAIProvider', () => {
  const logger = LoggerFactory.create();

  it('initializes with name', () => {
    const provider = new MockAIProvider(logger, 'test-mock');
    expect(provider.name).toBe('test-mock');
  });

  it('responds to chat requests', async () => {
    const provider = new MockAIProvider(logger);
    const response = await provider.chat({
      model: 'mock',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response).toBeDefined();
    expect(response).toContain('mock');
  });
});
