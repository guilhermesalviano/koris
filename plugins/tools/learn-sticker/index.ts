import type { ILogger, IStickerRulesGateway, Plugin, ToolDefinition, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getRequiredStringArg } from '../runtime';
import { loadLearnStickerConfig } from './config';

export const TOOL_NAME = 'learn_sticker' as const;

export async function learnSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  stickerRules: IStickerRulesGateway,
): Promise<ToolResult> {
  const description = getRequiredStringArg(args, 'description');
  if (!description) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: description' };
  }

  const sticker = context?.stickers?.[0];
  if (!sticker) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'No sticker found in the current message. Ask the user to send the sticker first, then call learn_sticker again.',
    };
  }

  const channel = context?.channel;
  if (!channel) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Missing channel: learn_sticker can only be used while replying inside a chat.',
    };
  }

  try {
    const rule = stickerRules.save({
      description,
      reference: sticker,
      channel,
    });

    logger.info('learn_sticker succeeded', { id: rule.id, description });
    return {
      toolName: TOOL_NAME,
      success: true,
      silent: false,
      result: JSON.stringify({ id: rule.id, description: rule.description }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('learn_sticker failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description:
    'Remember a sticker so it can be reused later. Only call this when the human\'s message is a reply that quotes a sticker (e.g. quoting a sticker and saying "use this one when I\'m happy" or "remember this for goodbyes") — WhatsApp cannot attach a caption to a sticker, so this is always taught by quoting it in a separate text reply, never by sending the sticker and text together. Fails if the message being answered did not quote a sticker.',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Clear description of the situation in which this sticker should be reused later (e.g. "when the user is happy or celebrating").',
      },
    },
    required: ['description'],
  },
};

export function create(context: ToolPluginContext): Plugin | null {
  const cfg = loadLearnStickerConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'learn-sticker',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args, execContext) => learnSticker(logger, args, execContext, context.stickerRules),
        enabled: (opts) => opts.trusted && opts.stickersEnabled,
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
