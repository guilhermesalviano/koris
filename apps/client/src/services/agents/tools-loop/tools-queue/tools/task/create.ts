import { DatabaseServiceFactory } from '../../../../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../../../../repositories/heartbeat';
import { Heartbeat } from '../../../../../../entities/heartbeat';
import type { ILogger } from '../../../../../../infrastructure/logger';
import type { ToolResult } from '../../../../../../types/tools';
import { getRequiredStringArg } from '../shared/runtime';
import { isValidCronExpression } from '../../../../../../utils/heartbeat';

export async function setTask(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const task = getRequiredStringArg(args, 'task');
  const cronExpression = getRequiredStringArg(args, 'cron_expression');

  if (!task) {
    return { toolName: 'set_task', success: false, error: 'Missing required parameter: task' };
  }

  if (!cronExpression) {
    return { toolName: 'set_task', success: false, error: 'Missing required parameter: cron_expression' };
  }

  if (!isValidCronExpression(cronExpression)) {
    return {
      toolName: 'set_task',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
    const heartbeat = new Heartbeat({ task, cronExpression: cronExpression.trim() });
    repo.save(heartbeat);

    logger.info('Task saved', { id: heartbeat.id, task, cronExpression });

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
