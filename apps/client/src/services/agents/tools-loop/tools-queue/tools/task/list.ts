import { DatabaseServiceFactory } from '../../../../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../../../../repositories/heartbeat';
import type { ILogger } from '../../../../../../infrastructure/logger';
import type { ToolResult } from '../../../../../../types/tools';

export async function listTasks(logger: ILogger, _args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
    const rows = repo.getAll();

    logger.info('Tasks listed', { count: rows.length });

    return {
      toolName: 'list_tasks',
      success: true,
      result: JSON.stringify(rows),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('list_tasks failed', { error: errorMsg });
    return { toolName: 'list_tasks', success: false, error: errorMsg };
  }
}
