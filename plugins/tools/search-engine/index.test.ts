import { beforeEach, describe, it, expect, vi } from 'vitest';

const mockSearxng = vi.hoisted(() => vi.fn());
const mockSerpApi = vi.hoisted(() => vi.fn());

vi.mock('./searxng', () => ({
  executeSearchViaSearxng: mockSearxng,
}));

vi.mock('./serpapi', () => ({
  executeSearchViaSerpApi: mockSerpApi,
}));

import { executeSearch } from './index';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('search_engine tool (orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses SearXNG and returns its result on success', async () => {
    mockSearxng.mockResolvedValue({ toolName: 'search_engine', success: true, result: '[]' });

    const result = await executeSearch(mockLogger, { query: 'test query' }, 'http://localhost:8080', 'api-key');

    expect(mockSearxng).toHaveBeenCalledWith(mockLogger, { query: 'test query' }, 'http://localhost:8080');
    expect(mockSerpApi).not.toHaveBeenCalled();
    expect(result).toEqual({ toolName: 'search_engine', success: true, result: '[]' });
  });

  it('does not fall back to SerpAPI when SearXNG fails, since the fallback is inactivated', async () => {
    mockSearxng.mockResolvedValue({ toolName: 'search_engine', success: false, error: 'SearXNG URL is not configured' });

    const result = await executeSearch(mockLogger, { query: 'test query' }, '', 'api-key');

    expect(mockSearxng).toHaveBeenCalled();
    expect(mockSerpApi).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('SearXNG URL is not configured');
  });
});
