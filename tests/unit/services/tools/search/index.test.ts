import { describe, it, expect, vi } from 'vitest';
import { executeSearch } from '../../../../../src/services/tools/search/index';
import * as serpapi from 'serpapi';
import { config } from '../../../../../src/config';

vi.mock('serpapi', () => ({
  getJson: vi.fn(),
}));

vi.mock('../../../../../src/config', () => ({
  config: {
    AI: {
      SEARCH_API_KEY: 'test-api-key',
    },
  },
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  silly: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
} as any;

describe('search_engine tool', () => {
  it('should return only the first search result', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({
      organic_results: [
        { title: 'First result', link: 'https://first.com' },
        { title: 'Second result', link: 'https://second.com' }
      ],
    });

    const result = await executeSearch(mockLogger, { query: 'test query' });

    expect(result.success).toBe(true);
    expect(result.result).toBe(JSON.stringify({ title: 'First result', link: 'https://first.com' }));
    expect(result.result).not.toContain('Second result');
  });

  it('should return error if query is missing', async () => {
    const result = await executeSearch(mockLogger, {});
    expect(result.success).toBe(false);
  });
});
