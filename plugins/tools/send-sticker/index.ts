import type { IChannelsGateway, ILogger, IStickerRulesGateway, Plugin, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { getOptionalStringArg, getRequiredStringArg } from '../runtime';

export const TOOL_NAME = 'send_sticker' as const;

export async function sendSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  stickerRules: IStickerRulesGateway,
  channels: IChannelsGateway,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');
  if (!id) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: id' };
  }

  const channel = context?.channel;
  const target = getOptionalStringArg(args, 'target') ?? context?.target;

  if (!channel || !target) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Missing channel/target: send_sticker can only be used while replying inside a chat.',
    };
  }

  const rule = stickerRules.getById(id);
  if (!rule) {
    return { toolName: TOOL_NAME, success: false, error: `No learned sticker found with id: ${id}` };
  }

  if (rule.channel !== channel) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Sticker ${id} was learned on ${rule.channel} and can't be sent on ${channel}.`,
    };
  }

  try {
    await channels.sendSticker(channel, target, rule.reference);

    logger.info('send_sticker succeeded', { id, channel, target });
    return {
      toolName: TOOL_NAME,
      success: true,
      silent: true,
      result: JSON.stringify({ id, channel, target }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('send_sticker failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'send-sticker',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Send a previously learned sticker in the current chat as part of replying. Only use a sticker whose "Learned Stickers" description clearly matches the current situation. Do not invent an id. ' +
          'WhatsApp cannot attach a caption to a sticker: this always sends it as its own standalone message, separate from any text you also return. If the sticker alone answers the request, return an empty final message instead of also describing it in words.',
        parameters: {
          id: { type: 'string', required: true, description: 'The id of the learned sticker to send, from the "Learned Stickers" list.' },
        },
        handler: (logger, args, execContext) => sendSticker(logger, args, execContext, context.stickerRules, context.channels),
        enabled: (opts) => opts.trusted && context.pluginEnablement.isEnabled('send-sticker'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
