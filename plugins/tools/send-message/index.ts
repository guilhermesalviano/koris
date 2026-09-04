import type { IChannelsGateway, ILogger, Plugin, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { getOptionalStringArg, getRequiredStringArg, isAllowedValue } from '../runtime';

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

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'send-message',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Start a new outbound message to someone through a channel (Telegram or WhatsApp). ' +
          'Provide the target: a Telegram chat id, or for WhatsApp a phone number (digits, "+" and separators are fine) or a full JID. ' +
          '"channel" is inferred from the current chat when messaging from a Telegram/WhatsApp chat; ' +
          'provide it explicitly otherwise. "content" must be the exact message body to send.',
        parameters: {
          channel: {
            type: 'string',
            enum: ['telegram', 'whatsapp'],
            description: 'Channel to send through. Optional when messaging from a Telegram or WhatsApp chat (inferred); required otherwise.',
          },
          target: {
            type: 'string',
            required: true,
            description: 'Recipient on the channel: a Telegram chat id, or a WhatsApp phone number (e.g. "5511999998888" or "+55 11 99999-8888") or JID.',
          },
          content: {
            type: 'string',
            required: true,
            description: 'Exact message body to send.',
          },
        },
        handler: (logger, args, execContext) => sendMessage(logger, args, execContext, context.channels),
        enabled: (opts) => opts.trusted && context.pluginEnablement.isEnabled('send-message'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
