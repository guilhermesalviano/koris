import { ILogger } from "../../../infrastructure/logger";
import { ToolResult } from "../../../types/tools";
import { executeSearchViaSearxng } from './searxng';
import { executeSearchViaSerpApi } from './serpapi';

// Set to true to fall back to SerpAPI when SearXNG fails or isn't configured.
// Inactivated while SearXNG is being trialed as the primary provider.
const SERPAPI_FALLBACK_ENABLED = false;

export async function executeSearch(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await executeSearchViaSearxng(logger, args);
  if (result.success || !SERPAPI_FALLBACK_ENABLED) {
    return result;
  }

  logger.warn('SearXNG search failed, falling back to SerpAPI', { error: result.error });
  return executeSearchViaSerpApi(logger, args);
}
