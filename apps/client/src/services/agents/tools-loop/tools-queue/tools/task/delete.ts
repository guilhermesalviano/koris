import { DatabaseServiceFactory } from '../../../../../../infrastructure/db-sqlite';
import { HeartbeatRepositoryFactory } from '../../../../../../repositories/heartbeat';
import type { ILogger } from '../../../../../../infrastructure/logger';
import type { ToolResult } from '../../../../../../types/tools';
import { getRequiredStringArg } from '../shared/runtime';

export async function deleteTask(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');

  if (!id) {
    return { toolName: 'delete_task', success: false, error: 'Missing required parameter: id' };
  }

  try {
    const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
    const deleted = repo.deleteById(id);

    if (!deleted) {
      return { toolName: 'delete_task', success: false, error: `Task not found: ${id}` };
    }

    logger.info('Task deleted', { id });

    return {
      toolName: 'delete_task',
      success: true,
      result: JSON.stringify({ deleted_id: id }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('delete_task failed', { error: errorMsg });
    return { toolName: 'delete_task', success: false, error: errorMsg };
  }
}
