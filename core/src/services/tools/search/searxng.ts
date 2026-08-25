import { ILogger } from "../../../infrastructure/logger";
import { ToolResult } from "../../../types/tools";
import { getOptionalNumberArg, getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';
import { config } from "../../../config";

const DEFAULT_RESULT_COUNT = 5;
// SearXNG has no analog to SerpAPI's num=100 promise — it returns whatever the
// enabled engines produced for a page (~10-30). Clamp lower to keep expectations honest.
const MAX_RESULT_COUNT = 50;
const MAX_RESULT_OUTPUT = 20000;
// SearXNG paginates in whole pages, not row offsets. This is a best-effort approximation.
const RESULTS_PER_PAGE_ESTIMATE = 10;

// SearXNG's time_range has no hour granularity; 'day' is the closest available.
const TIME_PERIOD_RANGE: Record<string, string> = {
  past_hour: 'day',
  past_day: 'day',
  past_week: 'week',
  past_month: 'month',
  past_year: 'year',
};

const SEARCH_TYPES = ['web', 'news', 'images', 'video'] as const;
const SEARCH_TYPE_CATEGORY: Record<string, string> = {
  web: 'general',
  news: 'news',
  images: 'images',
  video: 'videos',
};

interface SearxngResultItem {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string;
  engine?: string;
}

interface SearxngResponse {
  results?: SearxngResultItem[];
}

// SearXNG has one `language` field, not Google's separate gl/hl. If `hl` already
// carries a region (e.g. "pt-br"), appending `gl` too produces an invalid
// triple-segment tag (e.g. "pt-br-BR", rejected by SearXNG with a 400) — only
// compose when `hl` is a bare language code.
function composeLanguage(hl: string | null, gl: string | null): string | null {
  if (!hl) return gl;
  if (hl.includes('-')) return hl;
  return gl ? `${hl}-${gl.toUpperCase()}` : hl;
}

export async function executeSearchViaSearxng(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const query = getRequiredStringArg(args, 'query');
  if (!query) {
    return { toolName: 'search_engine', success: false, error: 'Missing required parameter: query' };
  }

  const baseUrl = config.AI.SEARXNG_URL;
  if (!baseUrl) {
    return { toolName: 'search_engine', success: false, error: 'SearXNG URL is not configured' };
  }

  const num = Math.min(Math.max(getOptionalNumberArg(args, 'num', DEFAULT_RESULT_COUNT), 1), MAX_RESULT_COUNT);
  const start = Math.max(getOptionalNumberArg(args, 'start', 0), 0);
  const gl = getOptionalStringArg(args, 'gl');
  const hl = getOptionalStringArg(args, 'hl');

  const searchType = getOptionalStringArg(args, 'search_type');
  if (searchType && !isAllowedValue(searchType, SEARCH_TYPES)) {
    return {
      toolName: 'search_engine',
      success: false,
      error: `Invalid search_type. Allowed values: ${SEARCH_TYPES.join(', ')}`,
    };
  }

  let timePeriod = getOptionalStringArg(args, 'time_period');
  if (!timePeriod && searchType === 'news') {
    timePeriod = 'past_day';
  }
  const timeRange = timePeriod ? TIME_PERIOD_RANGE[timePeriod] : null;
  const category = searchType ? SEARCH_TYPE_CATEGORY[searchType] : null;

  const language = composeLanguage(hl, gl);
  const pageno = Math.floor(start / RESULTS_PER_PAGE_ESTIMATE) + 1;

  logger.info('Executing search', { query, num, start, gl, hl, timePeriod, searchType });

  try {
    const params = new URLSearchParams({ q: query, format: 'json', pageno: String(pageno) });
    if (category) params.set('categories', category);
    if (language) params.set('language', language);
    if (timeRange) params.set('time_range', timeRange);

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`SearXNG request failed with status ${response.status}`);
    }

    const data = await response.json() as SearxngResponse;
    const results = Array.isArray(data.results) ? data.results : [];

    if (results.length > 0) {
      const topResults = results.slice(0, num).map((item, index) => {
        const entry: Record<string, unknown> = {
          position: start + index + 1,
          title: item.title,
          link: item.url,
          snippet: item.content,
        };
        if (item.engine) entry.source = item.engine;
        if (item.publishedDate) entry.date = item.publishedDate;
        return entry;
      });
      return {
        toolName: 'search_engine',
        success: true,
        result: JSON.stringify(topResults).slice(0, MAX_RESULT_OUTPUT),
      };
    } else {
      return {
        toolName: 'search_engine',
        success: true,
        result: "No search results found.",
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('SearXNG search failed', { query, error: errorMsg });
    return { toolName: 'search_engine', success: false, error: errorMsg };
  }
}
