import type { IChannelsGateway, ILogger, IStickerRulesGateway, Plugin, ToolDefinition, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getOptionalStringArg, getRequiredStringArg } from '../runtime';
import { loadSendStickerConfig } from './config';

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

const SCHEMA = {
  description:
    'Send a previously learned sticker in the current chat as part of replying. Only use a sticker whose "Learned Stickers" description clearly matches the current situation. Do not invent an id. ' +
    'WhatsApp cannot attach a caption to a sticker: this always sends it as its own standalone message, separate from any text you also return. If the sticker alone answers the request, return an empty final message instead of also describing it in words.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The id of the learned sticker to send, from the "Learned Stickers" list (required).',
      },
    },
    required: ['id'],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadSendStickerConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'send-sticker',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args, execContext) => sendSticker(logger, args, execContext, context.stickerRules, context.channels),
        enabled: (opts) => opts.trusted && opts.stickersEnabled,
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
