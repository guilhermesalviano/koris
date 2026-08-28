import type { ILogger, IHeartbeatGateway, Plugin, ToolDefinition, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getRequiredStringArg } from '../runtime';

export const TOOL_NAME = 'delete_beat' as const;

export async function deleteBeat(
  logger: ILogger,
  args: Record<string, unknown>,
  heartbeats: IHeartbeatGateway,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: id' };
  }

  try {
    const deleted = heartbeats.deleteById(id);

    if (!deleted) {
      return { toolName: TOOL_NAME, success: false, error: `Beat not found: ${id}` };
    }

    heartbeats.reschedule();
    logger.info('Beat deleted', { id });

    return {
      toolName: TOOL_NAME,
      success: true,
      result: JSON.stringify({ deleted_id: id }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('delete_beat failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description: 'Delete a beat by ID. Call this when the user wants to remove or cancel a beat. Use list_beats first if the ID is not known.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the beat to delete.',
      },
    },
    required: ['id'],
  },
};

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'delete-beat',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args) => deleteBeat(logger, args, context.heartbeats),
        enabled: (opts) => opts.trusted && opts.agentName !== 'heartbeat' && context.pluginEnablement.isEnabled('delete-beat'),
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
