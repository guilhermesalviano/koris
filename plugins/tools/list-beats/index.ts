import type { ILogger, IHeartbeatGateway, Plugin, ToolDefinition, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { loadListBeatsConfig } from './config';

export const TOOL_NAME = 'list_beats' as const;

export async function listBeats(
  logger: ILogger,
  _args: Record<string, unknown>,
  heartbeats: IHeartbeatGateway,
): Promise<ToolResult> {
  try {
    const rows = heartbeats.getAll();

    logger.info('Beats listed', { count: rows.length });

    return {
      toolName: TOOL_NAME,
      success: true,
      result: JSON.stringify(rows),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('list_beats failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description: 'List all saved beats and scheduled beats. Call this when the user asks to see, check, or review their beats.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadListBeatsConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'list-beats',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args) => listBeats(logger, args, context.heartbeats),
        enabled: (opts) => opts.trusted && opts.agentName !== 'heartbeat',
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
