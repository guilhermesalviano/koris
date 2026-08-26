import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { executeSearchViaSearxng } from './searxng';

const SEARXNG_URL = 'http://localhost:8080';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function search(args: Record<string, unknown>) {
  return executeSearchViaSearxng(mockLogger, args, SEARXNG_URL);
}

describe('search_engine tool (SearXNG provider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns up to 5 results by default', async () => {
    const results = Array.from({ length: 7 }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://result-${i + 1}.com`,
      content: `Snippet ${i + 1}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/search?q=test+query&format=json&pageno=1');
    const parsed = JSON.parse(result.result as string);
    expect(parsed).toHaveLength(5);
    expect(parsed[0]).toEqual({ position: 1, title: 'Result 1', link: 'https://result-1.com', snippet: 'Snippet 1' });
  });

  it('honors num and approximates start as a page number', async () => {
    const results = Array.from({ length: 3 }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://result-${i + 1}.com`,
      content: `Snippet ${i + 1}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await search({ query: 'test query', num: 3, start: 20 });

    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/search?q=test+query&format=json&pageno=3');
    const parsed = JSON.parse(result.result as string);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].position).toBe(21);
  });

  it('clamps num to the 1-50 range', async () => {
    const manyResults = Array.from({ length: 60 }, (_, i) => ({ title: `R${i}`, url: 'u', content: 'c' }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: manyResults }));
    vi.stubGlobal('fetch', fetchMock);

    const over = await search({ query: 'test query', num: 500 });
    expect(JSON.parse(over.result as string)).toHaveLength(50);

    const under = await search({ query: 'test query', num: 0 });
    expect(JSON.parse(under.result as string)).toHaveLength(1);
  });

  it('folds gl and hl into a single language param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await search({ query: 'test query', gl: 'br', hl: 'pt' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('language=pt-BR');
  });

  it('uses hl alone when gl is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await search({ query: 'test query', hl: 'en' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('language=en');
  });

  it('does not double up the region when hl already carries one (regression: pt-br + br -> pt-br, not pt-br-BR)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await search({ query: 'test query', hl: 'pt-br', gl: 'br' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('language=pt-br');
    expect(url).not.toContain('pt-br-BR');
  });

  it('maps time_period to time_range, falling back past_hour to day', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await search({ query: 'test query', time_period: 'past_week' });
    expect(fetchMock.mock.calls[0][0]).toContain('time_range=week');

    await search({ query: 'test query', time_period: 'past_hour' });
    expect(fetchMock.mock.calls[1][0]).toContain('time_range=day');
  });

  it('maps search_type to categories and rejects invalid values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await search({ query: 'test query', search_type: 'news' });
    expect(fetchMock.mock.calls[0][0]).toContain('categories=news');
    expect(fetchMock.mock.calls[0][0]).toContain('time_range=day');

    await search({ query: 'test query', search_type: 'video' });
    expect(fetchMock.mock.calls[1][0]).toContain('categories=videos');

    const result = await search({ query: 'test query', search_type: 'shopping' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid search_type');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns no-results message when results is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(true);
    expect(result.result).toBe('No search results found.');
  });

  it('returns error when the HTTP response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 403));
    vi.stubGlobal('fetch', fetchMock);

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('returns error when query is missing', async () => {
    const result = await search({});
    expect(result.success).toBe(false);
  });

  it('returns error when SearXNG URL is not configured', async () => {
    const result = await executeSearchViaSearxng(mockLogger, { query: 'test query' }, '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('maps source and date from engine and publishedDate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      results: [{ title: 'T', url: 'https://x.com', content: 'C', engine: 'wikipedia', publishedDate: '2026-08-17' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await search({ query: 'test query' });

    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.result as string);
    expect(parsed[0]).toEqual({
      position: 1,
      title: 'T',
      link: 'https://x.com',
      snippet: 'C',
      source: 'wikipedia',
      date: '2026-08-17',
    });
  });
});
