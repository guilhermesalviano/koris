import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { StickerRulesRepositoryFactory } from '../../../repositories/sticker-rules';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolExecutionContext, ToolResult } from '../../../types/tools';
import { getRequiredStringArg } from '../runtime';

export async function learnSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const description = getRequiredStringArg(args, 'description');
  if (!description) {
    return { toolName: 'learn_sticker', success: false, error: 'Missing required parameter: description' };
  }

  const sticker = context?.stickers?.[0];
  if (!sticker) {
    return {
      toolName: 'learn_sticker',
      success: false,
      error: 'No sticker found in the current message. Ask the user to send the sticker first, then call learn_sticker again.',
    };
  }

  const channel = context?.channel;
  if (!channel) {
    return {
      toolName: 'learn_sticker',
      success: false,
      error: 'Missing channel: learn_sticker can only be used while replying inside a chat.',
    };
  }

  try {
    const repo = StickerRulesRepositoryFactory.create(DatabaseServiceFactory.create());
    const rule = repo.save({
      description,
      reference: sticker,
      channel,
    });

    logger.info('learn_sticker succeeded', { id: rule.id, description });
    return { toolName: 'learn_sticker', success: true, result: JSON.stringify({ id: rule.id, description: rule.description }) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('learn_sticker failed', { error: errorMsg });
    return { toolName: 'learn_sticker', success: false, error: errorMsg };
  }
}
