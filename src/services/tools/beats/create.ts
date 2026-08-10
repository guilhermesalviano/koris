import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../repositories/heartbeat';
import { Heartbeat } from '../../../entities/heartbeat';
import { HeartbeatSingleton } from '../../../services/agents/sub-agents/heartbeat/runner';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolResult } from '../../../types/tools';
import { getRequiredStringArg, getOptionalStringArg, isAllowedValue } from '../runtime';
import { hasSpecificHour, isEveryMinute, isValidCronExpression } from '../../../utils/heartbeat';
import { BEAT_TYPES, BeatType } from '../../../types/beat';

export async function setBeat(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const beat = getRequiredStringArg(args, 'beat');
  const cronExpression = getRequiredStringArg(args, 'cron_expression');
  const rawType = getOptionalStringArg(args, 'type') ?? 'reminder';

  if (!beat) {
    return { toolName: 'set_beat', success: false, error: 'Missing required parameter: beat' };
  }

  if (!cronExpression) {
    return { toolName: 'set_beat', success: false, error: 'Missing required parameter: cron_expression' };
  }

  if (!isAllowedValue(rawType, BEAT_TYPES)) {
    return {
      toolName: 'set_beat',
      success: false,
      error: `Invalid parameter: type. Must be one of: ${BEAT_TYPES.join(', ')}.`,
    };
  }

  if (!isValidCronExpression(cronExpression)) {
    return {
      toolName: 'set_beat',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (isEveryMinute(cronExpression)) {
    return {
      toolName: 'set_beat',
      success: false,
      error: 'Beats that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (!hasSpecificHour(cronExpression)) {
    return {
      toolName: 'set_beat',
      success: false,
      error: 'No specific hour was provided for an every-minute schedule. Ask the user what hour they want this beat to run (e.g. "* 9 * * *" for every minute during 9am).',
    };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
    const heartbeat = new Heartbeat({ beat, type: rawType as BeatType, cronExpression: cronExpression.trim() });
    repo.save(heartbeat);
    HeartbeatSingleton.getExistingInstance()?.reschedule();

    logger.info('Beat saved', { id: heartbeat.id, beat, type: rawType, cronExpression });

    return {
      toolName: 'set_beat',
      success: true,
      result: JSON.stringify(heartbeat),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('set_beat failed', { error: errorMsg });
    return { toolName: 'set_beat', success: false, error: errorMsg };
  }
}
