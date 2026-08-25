import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../repositories/heartbeat';
import { HeartbeatSingleton } from '../../../services/agents/sub-agents/heartbeat/runner';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolResult } from '../../../types/tools';
import { getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';
import { hasSpecificHour, isEveryMinute, isValidCronExpression } from '../../../utils/heartbeat';
import { BEAT_TYPES } from '../../../types/beat';
import { CHANNEL_TYPES } from '../../../entities/channel';

function normalizeOptional(args: Record<string, unknown>, key: string): string | null | undefined {
  const value = getOptionalStringArg(args, key);
  if (value === null) return undefined;
  return value.length > 0 ? value : null;
}

export async function updateBeat(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: 'update_beat', success: false, error: 'Missing required parameter: id' };
  }

  const beat = getOptionalStringArg(args, 'beat') ?? undefined;
  const cronExpression = getOptionalStringArg(args, 'cron_expression') ?? undefined;
  const rawType = getOptionalStringArg(args, 'type') ?? undefined;
  const channel = normalizeOptional(args, 'channel');
  const target = normalizeOptional(args, 'target');

  if (!beat && !cronExpression && !rawType && channel === undefined && target === undefined) {
    return {
      toolName: 'update_beat',
      success: false,
      error: 'At least one of "beat", "type", "cron_expression", "channel", or "target" must be provided.',
    };
  }

  if (rawType && !isAllowedValue(rawType, BEAT_TYPES)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: `Invalid type: "${rawType}". Must be one of: ${BEAT_TYPES.join(', ')}.`,
    };
  }

  if (channel && !isAllowedValue(channel, CHANNEL_TYPES)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: `Invalid channel: "${channel}". Must be one of: ${CHANNEL_TYPES.join(', ')}.`,
    };
  }

  if ((channel && !target) || (!channel && target)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: 'Parameters "channel" and "target" must be provided together.',
    };
  }

  if (cronExpression && !isValidCronExpression(cronExpression)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (cronExpression && isEveryMinute(cronExpression)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: 'Beats that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (cronExpression && !hasSpecificHour(cronExpression)) {
    return {
      toolName: 'update_beat',
      success: false,
      error: 'No specific hour was provided for an every-minute schedule. Ask the user what hour they want this beat to run (e.g. "* 9 * * *" for every minute during 9am).',
    };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());

    if (!repo.getById(id)) {
      return { toolName: 'update_beat', success: false, error: `Beat not found: ${id}` };
    }

    const updated = repo.update(id, {
      beat,
      type: rawType as typeof BEAT_TYPES[number] | undefined,
      cronExpression: cronExpression?.trim(),
      channel,
      target,
    });
    HeartbeatSingleton.getExistingInstance()?.reschedule();

    logger.info('Beat updated', { id });

    return {
      toolName: 'update_beat',
      success: true,
      result: JSON.stringify(updated),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('update_beat failed', { error: errorMsg });
    return { toolName: 'update_beat', success: false, error: errorMsg };
  }
}
