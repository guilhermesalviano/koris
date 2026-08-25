import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { StickerRulesRepositoryFactory } from '../../../repositories/sticker-rules';
import { ChannelsSingleton } from '../../../channels';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolExecutionContext, ToolResult } from '../../../types/tools';
import { getOptionalStringArg, getRequiredStringArg } from '../runtime';

export async function sendSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');
  if (!id) {
    return { toolName: 'send_sticker', success: false, error: 'Missing required parameter: id' };
  }

  const channel = context?.channel;
  const target = getOptionalStringArg(args, 'target') ?? context?.target;

  if (!channel || !target) {
    return {
      toolName: 'send_sticker',
      success: false,
      error: 'Missing channel/target: send_sticker can only be used while replying inside a chat.',
    };
  }

  const repo = StickerRulesRepositoryFactory.create(DatabaseServiceFactory.create());
  const rule = repo.getById(id);
  if (!rule) {
    return { toolName: 'send_sticker', success: false, error: `No learned sticker found with id: ${id}` };
  }

  if (rule.channel !== channel) {
    return {
      toolName: 'send_sticker',
      success: false,
      error: `Sticker ${id} was learned on ${rule.channel} and can't be sent on ${channel}.`,
    };
  }

  const channelsManager = ChannelsSingleton.getExistingInstance();
  if (!channelsManager) {
    return {
      toolName: 'send_sticker',
      success: false,
      error: 'Outbound messaging is not available: no channel manager is running.',
    };
  }

  try {
    await channelsManager.sendSticker(channel, target, rule.reference);

    logger.info('send_sticker succeeded', { id, channel, target });
    return {
      toolName: 'send_sticker',
      success: true,
      silent: true,
      result: JSON.stringify({ id, channel, target }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('send_sticker failed', { error: errorMsg });
    return { toolName: 'send_sticker', success: false, error: errorMsg };
  }
}
