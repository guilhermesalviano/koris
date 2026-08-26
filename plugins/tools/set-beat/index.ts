import type { ILogger, IHeartbeatGateway, Plugin, ToolDefinition, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getRequiredStringArg, getOptionalStringArg, isAllowedValue } from '../runtime';
import { hasSpecificHour, isEveryMinute, isValidCronExpression } from '../cron';
import { loadSetBeatConfig } from './config';

export const TOOL_NAME = 'set_beat' as const;

const BEAT_TYPES = ['reminder', 'scheduled_beat'] as const;
const CHANNEL_TYPES = ['telegram', 'whatsapp'] as const;

export async function setBeat(
  logger: ILogger,
  args: Record<string, unknown>,
  heartbeats: IHeartbeatGateway,
): Promise<ToolResult> {
  const beat = getRequiredStringArg(args, 'beat');
  const cronExpression = getRequiredStringArg(args, 'cron_expression');
  const rawType = getOptionalStringArg(args, 'type') ?? 'reminder';
  const rawChannel = getOptionalStringArg(args, 'channel');
  const rawTarget = getOptionalStringArg(args, 'target');

  if (!beat) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: beat' };
  }

  if (!cronExpression) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: cron_expression' };
  }

  if (!isAllowedValue(rawType, BEAT_TYPES)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid parameter: type. Must be one of: ${BEAT_TYPES.join(', ')}.`,
    };
  }

  if (rawChannel && !isAllowedValue(rawChannel, CHANNEL_TYPES)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid parameter: channel. Must be one of: ${CHANNEL_TYPES.join(', ')}.`,
    };
  }

  if ((rawChannel && !rawTarget) || (!rawChannel && rawTarget)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Parameters "channel" and "target" must be provided together.',
    };
  }

  if (!isValidCronExpression(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (isEveryMinute(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Beats that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (!hasSpecificHour(cronExpression)) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'No specific hour was provided for an every-minute schedule. Ask the user what hour they want this beat to run (e.g. "* 9 * * *" for every minute during 9am).',
    };
  }

  try {
    const heartbeat = heartbeats.create({
      beat,
      type: rawType,
      cronExpression: cronExpression.trim(),
      channel: rawChannel ?? undefined,
      target: rawTarget ?? undefined,
    });
    heartbeats.reschedule();

    logger.info('Beat saved', { id: heartbeat.id, beat, type: rawType, cronExpression, channel: rawChannel, target: rawTarget });

    return {
      toolName: TOOL_NAME,
      success: true,
      result: JSON.stringify(heartbeat),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('set_beat failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description:
    'Save a reminder or scheduled beat for the user. DEFAULT BEHAVIOR: always create a one-time beat by pinning the exact minute, hour, day-of-month, and month — NEVER use * for day-of-month or month unless the user explicitly asks for a recurring schedule (e.g. "every day", "every Monday", "every month"). Only use wildcard (*) fields when the user clearly requests a recurring pattern.',
  parameters: {
    type: 'object',
    properties: {
      beat: {
        type: 'string',
        description: 'Clear description of what the user wants to be reminded about or the beat to schedule.',
      },
      type: {
        type: 'string',
        enum: ['reminder', 'scheduled_beat'],
        description: 'Type of the beat (optional, defaults to "reminder"): "reminder" for one-time or recurring reminders to the user, "scheduled_beat" for automated background beats to be executed by the agent.',
      },
      cron_expression: {
        type: 'string',
        description:
          'Standard 5-field cron expression. Format: "minute hour day-of-month month day-of-week". ' +
          'DEFAULT — one-time: always pin minute, hour, day-of-month and month to specific values (e.g. "30 9 15 6 *" = once on June 15th at 9:30am). ' +
          'ONLY use wildcards (*) when the user explicitly requests recurrence: ' +
          '"0 9 * * *" (every day at 9am), "0 9 * * 1" (every Monday at 9am), "0 8 1 * *" (1st of every month at 8am), "*/30 * * * *" (every 30 min).',
      },
    },
    required: ['beat', 'cron_expression'],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadSetBeatConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'set-beat',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args) => setBeat(logger, args, context.heartbeats),
        // Excludes the heartbeat sub-agent to avoid a beat recursively scheduling more beats.
        enabled: (opts) => opts.trusted && opts.agentName !== 'heartbeat',
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
