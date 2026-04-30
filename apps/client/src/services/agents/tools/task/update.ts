import { DatabaseServiceFactory } from '../../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../../repositories/heartbeat';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import { getOptionalStringArg, getRequiredStringArg } from '../shared/runtime';
import { isValidCronExpression, isEveryMinute, hasSpecificHour } from '../../../../utils/heartbeat';

export async function updateTask(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: 'update_task', success: false, error: 'Missing required parameter: id' };
  }

  const task = getOptionalStringArg(args, 'task') ?? undefined;
  const cronExpression = getOptionalStringArg(args, 'cron_expression') ?? undefined;

  if (!task && !cronExpression) {
    return {
      toolName: 'update_task',
      success: false,
      error: 'At least one of "task" or "cron_expression" must be provided.',
    };
  }

  if (cronExpression && !isValidCronExpression(cronExpression)) {
    return {
      toolName: 'update_task',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (cronExpression && isEveryMinute(cronExpression)) {
    return {
      toolName: 'update_task',
      success: false,
      error: 'Tasks that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (cronExpression && !hasSpecificHour(cronExpression)) {
    return {
      toolName: 'update_task',
      success: false,
      error: 'No specific hour was provided. Ask the user what hour they want this task to run (e.g. "0 9 * * *" for 9am daily).',
    };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());

    if (!repo.getById(id)) {
      return { toolName: 'update_task', success: false, error: `Task not found: ${id}` };
    }

    const updated = repo.update(id, {
      task,
      cronExpression: cronExpression?.trim(),
    });

    logger.info('Task updated', { id });

    return {
      toolName: 'update_task',
      success: true,
      result: JSON.stringify(updated),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('update_task failed', { error: errorMsg });
    return { toolName: 'update_task', success: false, error: errorMsg };
  }
}
