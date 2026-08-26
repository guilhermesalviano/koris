import { getJson } from "serpapi";
import type { ILogger, ToolResult } from '../contracts';
import { getOptionalNumberArg, getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';
import { TOOL_NAME } from './constants';

const DEFAULT_RESULT_COUNT = 5;
const MAX_RESULT_COUNT = 100;
const MAX_RESULT_OUTPUT = 20000;

const TIME_PERIOD_TBS: Record<string, string> = {
  past_hour: 'qdr:h',
  past_day: 'qdr:d',
  past_week: 'qdr:w',
  past_month: 'qdr:m',
  past_year: 'qdr:y',
};

const SEARCH_TYPES = ['web', 'news', 'images', 'video'] as const;
const SEARCH_TYPE_TBM: Record<string, string> = {
  news: 'nws',
  images: 'isch',
  video: 'vid',
};

function extractSource(item: Record<string, any>): string | null {
  if (typeof item.source === 'string') return item.source;
  if (item.source && typeof item.source === 'object' && typeof item.source.name === 'string') {
    return item.source.name;
  }
  return null;
}

function extractAuthor(item: Record<string, any>): string | null {
  const authors = item.publication_info?.authors ?? item.source?.authors;
  if (!Array.isArray(authors) || authors.length === 0) return null;
  const first = authors[0];
  if (typeof first === 'string') return first;
  return first?.name ?? null;
}

export async function executeSearchViaSerpApi(logger: ILogger, args: Record<string, unknown>, apiKey: string): Promise<ToolResult> {
  const query = getRequiredStringArg(args, 'query');
  if (!query) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: query' };
  }

  if (!apiKey) {
    return { toolName: TOOL_NAME, success: false, error: 'Search API key is not configured' };
  }

  const num = Math.min(Math.max(getOptionalNumberArg(args, 'num', DEFAULT_RESULT_COUNT), 1), MAX_RESULT_COUNT);
  const start = Math.max(getOptionalNumberArg(args, 'start', 0), 0);
  const gl = getOptionalStringArg(args, 'gl');
  const hl = getOptionalStringArg(args, 'hl');

  const searchType = getOptionalStringArg(args, 'search_type');
  if (searchType && !isAllowedValue(searchType, SEARCH_TYPES)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid search_type. Allowed values: ${SEARCH_TYPES.join(', ')}`,
    };
  }

  let timePeriod = getOptionalStringArg(args, 'time_period');
  if (!timePeriod && searchType === 'news') {
    timePeriod = 'past_day';
  }
  const tbs = timePeriod ? TIME_PERIOD_TBS[timePeriod] : null;
  const tbm = searchType ? SEARCH_TYPE_TBM[searchType] : null;

  logger.info('Executing search', { query, num, start, gl, hl, timePeriod, searchType });

  try {
    const params: Record<string, unknown> = {
      engine: "google",
      q: query,
      api_key: apiKey,
      num,
      start,
    };
    if (gl) params.gl = gl;
    if (hl) params.hl = hl;
    if (tbs) params.tbs = tbs;
    if (tbm) params.tbm = tbm;

    const result = await getJson(params);

    const isNews = tbm === 'nws';
    const primary = isNews ? result.news_results : result.organic_results;
    const fallback = isNews ? result.organic_results : result.news_results;
    const results = (Array.isArray(primary) && primary.length > 0) ? primary : fallback;

    if (Array.isArray(results) && results.length > 0) {
      const topResults = results.slice(0, num).map((item, index) => {
        const entry: Record<string, unknown> = {
          position: start + index + 1,
          title: item.title,
          link: item.link,
          snippet: item.snippet ?? item.description,
        };
        const source = extractSource(item);
        if (source) entry.source = source;
        if (item.date) entry.date = item.date;
        if (item.published_at) entry.published_at = item.published_at;
        const author = extractAuthor(item);
        if (author) entry.author = author;
        return entry;
      });
      return {
        toolName: TOOL_NAME,
        success: true,
        result: JSON.stringify(topResults).slice(0, MAX_RESULT_OUTPUT),
      };
    } else {
      return {
        toolName: TOOL_NAME,
        success: true,
        result: "No search results found.",
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Search failed', { query, error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}
