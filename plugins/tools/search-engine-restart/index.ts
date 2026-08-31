import path from 'node:path';
import type { ILogger, Plugin, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { spawnCommand } from '../runtime';
import { TOOL_NAME } from './constants';

export { TOOL_NAME };

const MAX_RESULT_OUTPUT = 20000;
// The script polls readiness for up to 60s, plus `docker compose down`/`up -d`
// overhead — leave comfortable headroom above that.
const RESTART_TIMEOUT_MS = 120000;

/**
 * Restarts the local SearXNG container via `scripts/run_search_engine.sh --restart`
 * (a full `docker compose down` + `up -d`, not just "start if not running") —
 * fixes both "container is down" and "container is up but running with the
 * wrong config" (e.g. a stale bind mount serving SearXNG's bare defaults,
 * which disables the JSON API and causes HTTP 403s from `search_engine`).
 */
export async function executeRestartSearchEngine(logger: ILogger, baseDir: string = process.cwd()): Promise<ToolResult> {
  const scriptPath = path.join(baseDir, 'scripts', 'run_search_engine.sh');
  logger.info('Restarting SearXNG container', { scriptPath });

  try {
    const { stdout, stderr, code } = await spawnCommand({
      command: 'bash',
      args: [scriptPath, '--restart'],
      timeoutMs: RESTART_TIMEOUT_MS,
    });
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();

    if (code === 0) {
      return {
        toolName: TOOL_NAME,
        success: true,
        result: (output || 'SearXNG restarted successfully.').slice(0, MAX_RESULT_OUTPUT),
      };
    }

    return {
      toolName: TOOL_NAME,
      success: false,
      error: `restart_search_engine exited with code ${code}:\n${output}`.slice(0, MAX_RESULT_OUTPUT),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to restart SearXNG', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'search-engine-restart',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Restarts the local SearXNG Docker container (docker compose down, then up) used by the search_engine tool. ' +
          'Use this when search_engine fails with a connection error ("Couldn\'t connect to server") or an HTTP 403 error — both usually mean the container is down or running with a stale/incorrect config, and a restart fixes it. ' +
          'Requires Docker to be installed and running on the host; takes up to about 2 minutes. ' +
          'REQUIRES CONFIRMATION: this stops and recreates a running container. Before calling this tool, tell the human that search_engine failed and ask if they want you to restart SearXNG to fix it. Only call this tool after the human has explicitly confirmed in a follow-up message.',
        handler: (logger) => executeRestartSearchEngine(logger),
        enabled: (opts) => opts.trusted && (opts.searchEnabled ?? true) && context.pluginEnablement.isEnabled('search-engine-restart'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
