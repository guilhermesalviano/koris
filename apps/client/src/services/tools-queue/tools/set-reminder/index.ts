import { randomUUID } from 'node:crypto';
import { DatabaseServiceFactory } from '../../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import { getRequiredStringArg } from '../shared/runtime';
import { isValidCronExpression } from './shared';

export async function setReminder(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const task = getRequiredStringArg(args, 'task');
  const cronExpression = getRequiredStringArg(args, 'cron_expression');

  if (!task) {
    return { toolName: 'set_reminder', success: false, error: 'Missing required parameter: task' };
  }

  if (!cronExpression) {
    return { toolName: 'set_reminder', success: false, error: 'Missing required parameter: cron_expression' };
  }

  if (!isValidCronExpression(cronExpression)) {
    return {
      toolName: 'set_reminder',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  try {
    const db = DatabaseServiceFactory.create();
    const id = randomUUID();

    db.run(
      `INSERT INTO heartbeat (id, task, cron_expression) VALUES (?, ?, ?)`,
      [id, task, cronExpression.trim()],
    );

    logger.info('Reminder saved', { id, task, cronExpression });

    return {
      toolName: 'set_reminder',
      success: true,
      result: JSON.stringify({ id, task, cron_expression: cronExpression.trim() }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('set_reminder failed', { error: errorMsg });
    return { toolName: 'set_reminder', success: false, error: errorMsg };
  }
}
