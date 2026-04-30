import { DatabaseServiceFactory } from '../../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import { getOptionalStringArg, getRequiredStringArg } from '../shared/runtime';
import { isValidCronExpression, type HeartbeatRow } from './shared';

export async function updateReminder(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: 'update_reminder', success: false, error: 'Missing required parameter: id' };
  }

  const task = getOptionalStringArg(args, 'task');
  const cronExpression = getOptionalStringArg(args, 'cron_expression');

  if (!task && !cronExpression) {
    return {
      toolName: 'update_reminder',
      success: false,
      error: 'At least one of "task" or "cron_expression" must be provided.',
    };
  }

  if (cronExpression && !isValidCronExpression(cronExpression)) {
    return {
      toolName: 'update_reminder',
      success: false,
      error: `Invalid cron expression: "${cronExpression}". Expected 5-field standard cron format (e.g. "0 9 * * 1" for every Monday at 9am).`,
    };
  }

  try {
    const db = DatabaseServiceFactory.create();

    const existing = db.get<HeartbeatRow>(`SELECT * FROM heartbeat WHERE id = ?`, [id]);
    if (!existing) {
      return { toolName: 'update_reminder', success: false, error: `Reminder not found: ${id}` };
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (task) {
      fields.push('task = ?');
      params.push(task);
    }

    if (cronExpression) {
      fields.push('cron_expression = ?');
      params.push(cronExpression.trim());
    }

    params.push(id);
    db.run(`UPDATE heartbeat SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = db.get<HeartbeatRow>(`SELECT * FROM heartbeat WHERE id = ?`, [id]);
    logger.info('Reminder updated', { id });

    return {
      toolName: 'update_reminder',
      success: true,
      result: JSON.stringify(updated),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('update_reminder failed', { error: errorMsg });
    return { toolName: 'update_reminder', success: false, error: errorMsg };
  }
}
