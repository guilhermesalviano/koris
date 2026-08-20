import { DatabaseServiceFactory } from '../../../infrastructure/db-sqlite';
import { ChannelsSingleton } from '../../../channels';
import { OutboundMessageServiceFactory } from '../../outbound/outbound-message-service';
import type { ILogger } from '../../../infrastructure/logger';
import type { ToolResult } from '../../../types/tools';
import { getOptionalStringArg, getRequiredStringArg } from '../runtime';

export async function sendMessage(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const content = getRequiredStringArg(args, 'content');
  if (!content) {
    return { toolName: 'send_message', success: false, error: 'Missing required parameter: content' };
  }

  const channel = getOptionalStringArg(args, 'channel');
  const target = getOptionalStringArg(args, 'target');

  if (!channel || !target) {
    return {
      toolName: 'send_message',
      success: false,
      error: 'Missing parameters: channel and target are required (Telegram chat id or WhatsApp JID).',
    };
  }

  const channelsManager = ChannelsSingleton.getExistingInstance();
  if (!channelsManager) {
    return {
      toolName: 'send_message',
      success: false,
      error: 'Outbound messaging is not available: no channel manager is running.',
    };
  }

  try {
    const service = OutboundMessageServiceFactory.create(logger, channelsManager, DatabaseServiceFactory.create());
    const message = await service.send({
      content,
      channel,
      target,
    });

    if (message.status === 'failed') {
      return {
        toolName: 'send_message',
        success: false,
        error: message.errorMessage ?? 'Failed to send the message.',
      };
    }

    logger.info('send_message succeeded', { id: message.id, channel: message.channel, target: message.target });
    return { toolName: 'send_message', success: true, result: JSON.stringify(message) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('send_message failed', { error: errorMsg });
    return { toolName: 'send_message', success: false, error: errorMsg };
  }
}