import type { ILogger, IHeartbeatGateway, Plugin, ToolDefinition, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';
import { hasSpecificHour, isEveryMinute, isValidCronExpression } from '../cron';
import { loadUpdateBeatConfig } from './config';

export const TOOL_NAME = 'update_beat' as const;

const BEAT_TYPES = ['reminder', 'scheduled_beat'] as const;
const CHANNEL_TYPES = ['telegram', 'whatsapp'] as const;

function normalizeOptional(args: Record<string, unknown>, key: string): string | null | undefined {
  const value = getOptionalStringArg(args, key);
  if (value === null) return undefined;
  return value.length > 0 ? value : null;
}

export async function updateBeat(
  logger: ILogger,
  args: Record<string, unknown>,
  heartbeats: IHeartbeatGateway,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: id' };
  }

  const beat = getOptionalStringArg(args, 'beat') ?? undefined;
  const cronExpression = getOptionalStringArg(args, 'cron_expression') ?? undefined;
  const rawType = getOptionalStringArg(args, 'type') ?? undefined;
  const channel = normalizeOptional(args, 'channel');
  const target = normalizeOptional(args, 'target');

  if (!beat && !cronExpression && !rawType && channel === undefined && target === undefined) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'At least one of "beat", "type", "cron_expression", "channel", or "target" must be provided.',
    };
  }

  if (rawType && !isAllowedValue(rawType, BEAT_TYPES)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid type: "${rawType}". Must be one of: ${BEAT_TYPES.join(', ')}.`,
    };
  }

  if (channel && !isAllowedValue(channel, CHANNEL_TYPES)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid channel: "${channel}". Must be one of: ${CHANNEL_TYPES.join(', ')}.`,
    };
  }

  if ((channel && !target) || (!channel && target)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Parameters "channel" and "target" must be provided together.',
    };
  }

  if (cronExpression && !isValidCronExpression(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (cronExpression && isEveryMinute(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Beats that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (cronExpression && !hasSpecificHour(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'No specific hour was provided for an every-minute schedule. Ask the user what hour they want this beat to run (e.g. "* 9 * * *" for every minute during 9am).',
    };
  }

  try {
    if (!heartbeats.getById(id)) {
      return { toolName: TOOL_NAME, success: false, error: `Beat not found: ${id}` };
    }

    const updated = heartbeats.update(id, {
      beat,
      type: rawType,
      cronExpression: cronExpression?.trim(),
      channel,
      target,
    });
    heartbeats.reschedule();

    logger.info('Beat updated', { id });

    return {
      toolName: TOOL_NAME,
      success: true,
      result: JSON.stringify(updated),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('update_beat failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description: 'Update an existing beat. Call this when the user wants to change the description, type, or schedule of a beat. Use list_beats first if the ID is not known.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the beat to update.',
      },
      beat: {
        type: 'string',
        description: 'New description for the beat (optional).',
      },
      type: {
        type: 'string',
        enum: ['reminder', 'scheduled_beat'],
        description: 'New type for the beat (optional): "reminder" or "scheduled_beat".',
      },
      cron_expression: {
        type: 'string',
        description: 'New 5-field cron expression for the schedule (optional). Examples: "0 9 * * *" (daily at 9am), "0 9 * * 1" (every Monday at 9am).',
      },
    },
    required: ['id'],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadUpdateBeatConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'update-beat',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args) => updateBeat(logger, args, context.heartbeats),
        enabled: (opts) => opts.trusted && opts.agentName !== 'heartbeat',
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
