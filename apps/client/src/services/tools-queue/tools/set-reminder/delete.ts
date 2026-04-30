import { DatabaseServiceFactory } from '../../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import { getRequiredStringArg } from '../shared/runtime';

export async function deleteReminder(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: 'delete_reminder', success: false, error: 'Missing required parameter: id' };
  }

  try {
    const db = DatabaseServiceFactory.create();

    const result = db.run(`DELETE FROM heartbeat WHERE id = ?`, [id]);

    if (result.changes === 0) {
      return { toolName: 'delete_reminder', success: false, error: `Reminder not found: ${id}` };
    }

    logger.info('Reminder deleted', { id });

    return {
      toolName: 'delete_reminder',
      success: true,
      result: JSON.stringify({ deleted_id: id }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('delete_reminder failed', { error: errorMsg });
    return { toolName: 'delete_reminder', success: false, error: errorMsg };
  }
}
