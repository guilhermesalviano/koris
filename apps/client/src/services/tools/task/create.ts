import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../repositories/heartbeat';
import { Heartbeat } from '../../../entities/heartbeat';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolResult } from '../../../types/tools';
import { getRequiredStringArg, getOptionalStringArg, isAllowedValue } from '../shared/runtime';
import { isValidCronExpression, isEveryMinute, hasSpecificHour } from '../../../utils/heartbeat';
import { TASK_TYPES, TaskType } from '../../../types/task';

export async function setTask(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const task = getRequiredStringArg(args, 'task');
  const cronExpression = getRequiredStringArg(args, 'cron_expression');
  const rawType = getOptionalStringArg(args, 'type') ?? 'reminder';

  if (!task) {
    return { toolName: 'set_task', success: false, error: 'Missing required parameter: task' };
  }

  if (!cronExpression) {
    return { toolName: 'set_task', success: false, error: 'Missing required parameter: cron_expression' };
  }

  if (!isAllowedValue(rawType, TASK_TYPES)) {
    return {
      toolName: 'set_task',
      success: false,
      error: `Invalid parameter: type. Must be one of: ${TASK_TYPES.join(', ')}.`,
    };
  }

  if (!isValidCronExpression(cronExpression)) {
    return {
      toolName: 'set_task',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  if (isEveryMinute(cronExpression)) {
    return {
      toolName: 'set_task',
      success: false,
      error: 'Tasks that run every minute are not allowed. Please provide a less frequent schedule.',
    };
  }

  if (!hasSpecificHour(cronExpression)) {
    return {
      toolName: 'set_task',
      success: false,
      error: 'No specific hour was provided. Ask the user what hour they want this task to run (e.g. "0 9 * * *" for 9am daily).',
    };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
    const heartbeat = new Heartbeat({ task, type: rawType as TaskType, cronExpression: cronExpression.trim() });
    repo.save(heartbeat);

    logger.info('Task saved', { id: heartbeat.id, task, type: rawType, cronExpression });

    return {
      toolName: 'set_task',
      success: true,
      result: JSON.stringify(heartbeat),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('set_task failed', { error: errorMsg });
    return { toolName: 'set_task', success: false, error: errorMsg };
  }
}
