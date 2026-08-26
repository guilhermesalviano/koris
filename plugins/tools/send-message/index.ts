import type { IChannelsGateway, ILogger, Plugin, ToolDefinition, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';
import { loadSendMessageConfig } from './config';

export const TOOL_NAME = 'send_message' as const;

const CHANNEL_TYPES = ['telegram', 'whatsapp'] as const;

export async function sendMessage(
  logger: ILogger,
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  channels: IChannelsGateway,
): Promise<ToolResult> {
  const content = getRequiredStringArg(args, 'content');
  if (!content) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: content' };
  }

  const explicitChannel = getOptionalStringArg(args, 'channel');
  const inferredChannel = context?.channel ?? '';
  const channel = explicitChannel ?? (isAllowedValue(inferredChannel, CHANNEL_TYPES) ? inferredChannel : null);
  const target = getOptionalStringArg(args, 'target');

  if (!channel || !target) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Missing parameters: channel and target are required. Channel is inferred when messaging from a Telegram or WhatsApp chat; otherwise provide it explicitly.',
    };
  }

  try {
    const message = await channels.sendMessage(channel, target, content);

    if (message.status === 'failed') {
      return {
        toolName: TOOL_NAME,
        success: false,
        error: message.errorMessage ?? 'Failed to send the message.',
      };
    }

    logger.info('send_message succeeded', { id: message.id, channel: message.channel, target: message.target });
    return { toolName: TOOL_NAME, success: true, result: JSON.stringify(message) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('send_message failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description:
    'Start a new outbound message to someone through a channel (Telegram or WhatsApp). ' +
    'Provide the target (Telegram chat id or WhatsApp JID). "channel" is inferred from the current chat when messaging from a Telegram/WhatsApp chat; ' +
    'provide it explicitly otherwise. "content" must be the exact message body to send.',
  parameters: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        enum: ['telegram', 'whatsapp'],
        description: 'Channel to send through. Optional when messaging from a Telegram or WhatsApp chat (inferred); required otherwise.',
      },
      target: {
        type: 'string',
        description: 'Recipient address on the channel (Telegram chat id or WhatsApp JID) (required).',
      },
      content: {
        type: 'string',
        description: 'Exact message body to send (required).',
      },
    },
    required: ['content', 'target'],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadSendMessageConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'send-message',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args, execContext) => sendMessage(logger, args, execContext, context.channels),
        enabled: (opts) => opts.trusted,
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
