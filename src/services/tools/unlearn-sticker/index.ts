import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { StickerRulesRepositoryFactory } from '../../../repositories/sticker-rules';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolExecutionContext, ToolResult } from '../../../types/tools';
import { getRequiredStringArg } from '../runtime';

export async function unlearnSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');
  if (!id) {
    return { toolName: 'unlearn_sticker', success: false, error: 'Missing required parameter: id' };
  }

  const channel = context?.channel;
  if (!channel) {
    return {
      toolName: 'unlearn_sticker',
      success: false,
      error: 'Missing channel: unlearn_sticker can only be used while replying inside a chat.',
    };
  }

  const repo = StickerRulesRepositoryFactory.create(DatabaseServiceFactory.create());
  const rule = repo.getById(id);
  if (!rule) {
    return { toolName: 'unlearn_sticker', success: false, error: `No learned sticker found with id: ${id}` };
  }

  if (rule.channel !== channel) {
    return {
      toolName: 'unlearn_sticker',
      success: false,
      error: `Sticker ${id} was learned on ${rule.channel} and can't be unlearned from ${channel}.`,
    };
  }

  try {
    repo.deleteById(id);
    logger.info('unlearn_sticker succeeded', { id });
    return { toolName: 'unlearn_sticker', success: true, silent: false, result: JSON.stringify({ id }) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('unlearn_sticker failed', { error: errorMsg });
    return { toolName: 'unlearn_sticker', success: false, error: errorMsg };
  }
}
