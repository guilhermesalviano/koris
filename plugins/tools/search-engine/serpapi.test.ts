import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSearchViaSerpApi } from './serpapi';
import * as serpapi from 'serpapi';

vi.mock('serpapi', () => ({
  getJson: vi.fn(),
}));

const API_KEY = 'test-api-key';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  silly: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
} as any;

function search(args: Record<string, unknown>, apiKey = API_KEY) {
  return executeSearchViaSerpApi(mockLogger, args, apiKey);
}

describe('search_engine tool (SerpAPI provider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return up to 5 results by default', async () => {
    const organicResults = Array.from({ length: 7 }, (_, i) => ({
      title: `Result ${i + 1}`,
      link: `https://result-${i + 1}.com`,
      snippet: `Snippet ${i + 1}`,
    }));
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: organicResults });

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(true);
    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
    });
    const parsed = JSON.parse(result.result as string);
    expect(parsed).toHaveLength(5);
    expect(parsed[0].position).toBe(1);
    expect(parsed[4].title).toBe('Result 5');
  });

  it('should honor num and start and compute positions', async () => {
    const organicResults = Array.from({ length: 3 }, (_, i) => ({
      title: `Result ${i + 1}`,
      link: `https://result-${i + 1}.com`,
      snippet: `Snippet ${i + 1}`,
    }));
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: organicResults });

    const result = await search({ query: 'test query', num: 3, start: 10 });

    expect(result.success).toBe(true);
    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 3,
      start: 10,
    });
    const parsed = JSON.parse(result.result as string);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].position).toBe(11);
  });

  it('should clamp num to the 1-100 range', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: [] });

    await search({ query: 'test query', num: 500 });
    expect(serpapi.getJson).toHaveBeenCalledWith(expect.objectContaining({ num: 100 }));

    await search({ query: 'test query', num: 0 });
    expect(serpapi.getJson).toHaveBeenCalledWith(expect.objectContaining({ num: 1 }));
  });

  it('should forward gl, hl, time_period and search_type to SerpAPI', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: [] });

    await search({
      query: 'test query',
      gl: 'br',
      hl: 'pt-br',
      time_period: 'past_week',
      search_type: 'news',
    });

    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
      gl: 'br',
      hl: 'pt-br',
      tbs: 'qdr:w',
      tbm: 'nws',
    });
  });

  it('should not include optional params when not provided', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: [] });

    await search({ query: 'test query' });

    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
    });
  });

  it('should reject an invalid time_period by ignoring it', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: [] });

    await search({ query: 'test query', time_period: 'last_decade' });

    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
    });
  });

  it('should reject an invalid search_type', async () => {
    const result = await search({ query: 'test query', search_type: 'shopping' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid search_type');
    expect(serpapi.getJson).not.toHaveBeenCalled();
  });

  it('should return news results from news_results when search_type is news', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({
      news_results: [
        {
          title: 'Strait of Hormuz news',
          link: 'https://news.com/1',
          snippet: 'A news snippet',
          source: 'CNN',
          date: '2 hours ago',
          published_at: '2026-08-17 10:00:00 UTC',
        },
      ],
    });

    const result = await search({ query: 'Estreito de Hormuz', search_type: 'news' });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      position: 1,
      title: 'Strait of Hormuz news',
      link: 'https://news.com/1',
      snippet: 'A news snippet',
      source: 'CNN',
      date: '2 hours ago',
      published_at: '2026-08-17 10:00:00 UTC',
    });
  });

  it('should default news searches to past_day when no time_period given', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ news_results: [] });

    await search({ query: 'test query', search_type: 'news' });

    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
      tbs: 'qdr:d',
      tbm: 'nws',
    });
  });

  it('should keep explicit time_period on news searches', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ news_results: [] });

    await search({
      query: 'test query',
      search_type: 'news',
      time_period: 'past_hour',
    });

    expect(serpapi.getJson).toHaveBeenCalledWith({
      engine: 'google',
      q: 'test query',
      api_key: 'test-api-key',
      num: 5,
      start: 0,
      tbs: 'qdr:h',
      tbm: 'nws',
    });
  });

  it('should map source object and source.authors on news results', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({
      news_results: [
        {
          title: 'News with object source',
          link: 'https://news.com/2',
          snippet: 'Snippet',
          source: { name: 'Reuters', authors: ['Jane Doe'] },
          date: '1 day ago',
        },
      ],
    });

    const result = await search({ query: 'test query', search_type: 'news' });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result as string);
    expect(parsed[0]).toEqual({
      position: 1,
      title: 'News with object source',
      link: 'https://news.com/2',
      snippet: 'Snippet',
      source: 'Reuters',
      date: '1 day ago',
      author: 'Jane Doe',
    });
  });

  it('should fall back to description for snippet on news results', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({
      news_results: [
        {
          title: 'No snippet',
          link: 'https://news.com/3',
          description: 'Description fallback',
          source: 'BBC',
        },
      ],
    });

    const result = await search({ query: 'test query', search_type: 'news' });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result as string);
    expect(parsed[0].snippet).toBe('Description fallback');
  });

  it('should fall back to organic_results when news_results is empty', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({
      news_results: [],
      organic_results: [{ title: 'Organic', link: 'https://organic.com', snippet: 'S' }],
    });

    const result = await search({ query: 'test query', search_type: 'news' });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result as string);
    expect(parsed[0].title).toBe('Organic');
  });

  it('should return error if query is missing', async () => {
    const result = await search({});
    expect(result.success).toBe(false);
  });

  it('should return error when the API key is not configured', async () => {
    const result = await search({ query: 'test query' }, '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should return no results message when organic_results is empty', async () => {
    vi.mocked(serpapi.getJson).mockResolvedValue({ organic_results: [] });

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(true);
    expect(result.result).toBe('No search results found.');
  });
});
