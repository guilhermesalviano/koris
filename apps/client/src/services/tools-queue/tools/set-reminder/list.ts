import { DatabaseServiceFactory } from '../../../../infrastructure/db-sqlite';
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import type { HeartbeatRow } from './shared';

export async function listReminders(logger: ILogger, _args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const db = DatabaseServiceFactory.create();
    const rows = db.query<HeartbeatRow>(
      `SELECT id, task, cron_expression, last_run, created_at FROM heartbeat ORDER BY created_at DESC`,
    );

    logger.info('Reminders listed', { count: rows.length });

    return {
      toolName: 'list_reminders',
      success: true,
      result: JSON.stringify(rows),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('list_reminders failed', { error: errorMsg });
    return { toolName: 'list_reminders', success: false, error: errorMsg };
  }
}
