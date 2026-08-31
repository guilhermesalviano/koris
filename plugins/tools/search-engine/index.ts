import type { ILogger, Plugin, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { executeSearchViaSearxng } from './searxng';
import { executeSearchViaSerpApi } from './serpapi';
import { TOOL_NAME } from './constants';

export { TOOL_NAME };

// Set to true to fall back to SerpAPI when SearXNG fails or isn't configured.
// Inactivated while SearXNG is being trialed as the primary provider.
const SERPAPI_FALLBACK_ENABLED = false;

export async function executeSearch(
  logger: ILogger,
  args: Record<string, unknown>,
  searxngUrl: string,
  searchApiKey: string,
): Promise<ToolResult> {
  const result = await executeSearchViaSearxng(logger, args, searxngUrl);
  if (result.success || !SERPAPI_FALLBACK_ENABLED) {
    return result;
  }

  logger.warn('SearXNG search failed, falling back to SerpAPI', { error: result.error });
  return executeSearchViaSerpApi(logger, args, searchApiKey);
}

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'search-engine',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Perform a web search using Google Search API. Supports country, language, recency, pagination and search type context. ' +
          'If this tool fails with a connection error ("Couldn\'t connect to server") or an HTTP 403 error, the local SearXNG service is likely down or misconfigured — tell the human it failed and ask if they want you to run the restart_search_engine tool to fix it (that tool requires its own separate confirmation before running).',
        parameters: {
          query: { type: 'string', required: true, description: 'The search query string.' },
          num: { type: 'number', description: 'Number of results to return (default: 5, max: 100).' },
          start: { type: 'number', description: 'Pagination offset (0 = first page, 10 = second page). Use to fetch later results.' },
          gl: { type: 'string', description: 'Country code (ISO 3166-1 alpha-2) to localize results, e.g. "br", "us", "de".' },
          hl: { type: 'string', description: 'Language code to localize results, e.g. "pt-br", "en".' },
          time_period: {
            type: 'string',
            enum: ['past_hour', 'past_day', 'past_week', 'past_month', 'past_year'],
            description: 'Recency filter to get only the latest results.',
          },
          search_type: {
            type: 'string',
            enum: ['web', 'news', 'images', 'video'],
            description: 'Search type (default: "web").',
          },
        },
        handler: (logger, args) => executeSearch(logger, args, context.config.searxngUrl, context.config.searchApiKey),
        enabled: (opts) => opts.trusted && (opts.searchEnabled ?? true) && context.pluginEnablement.isEnabled('search-engine'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
