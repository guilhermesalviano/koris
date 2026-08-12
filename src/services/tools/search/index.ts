import { getJson } from "serpapi";
import { ILogger } from "../../../infrastructure/logger";
import { ToolResult } from "../../../types/tools";
import { getRequiredStringArg } from '../runtime';
import { config } from "../../../config";

export async function executeSearch(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const query = getRequiredStringArg(args, 'query');
  if (!query) {
    return { toolName: 'search_engine', success: false, error: 'Missing required parameter: query' };
  }

  const apiKey = config.AI.SEARCH_API_KEY;
  if (!apiKey) {
    return { toolName: 'search_engine', success: false, error: 'Search API key is not configured' };
  }

  logger.info('Executing search', { query });

  try {
    const result = await getJson({
      engine: "google",
      q: query,
      api_key: apiKey,
    });

    const organicResults = result.organic_results;
    if (Array.isArray(organicResults) && organicResults.length > 0) {
      return {
        toolName: 'search_engine',
        success: true,
        result: JSON.stringify(organicResults[0]),
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
    logger.error('Search failed', { query, error: errorMsg });
    return { toolName: 'search_engine', success: false, error: errorMsg };
  }
}
