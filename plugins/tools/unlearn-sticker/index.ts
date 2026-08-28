import type { ILogger, IStickerRulesGateway, Plugin, ToolExecutionContext, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { getRequiredStringArg } from '../runtime';

export const TOOL_NAME = 'unlearn_sticker' as const;

export async function unlearnSticker(
  logger: ILogger,
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  stickerRules: IStickerRulesGateway,
): Promise<ToolResult> {
  const id = getRequiredStringArg(args, 'id');
  if (!id) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: id' };
  }

  const channel = context?.channel;
  if (!channel) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Missing channel: unlearn_sticker can only be used while replying inside a chat.',
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
      error: `Sticker ${id} was learned on ${rule.channel} and can't be unlearned from ${channel}.`,
    };
  }

  try {
    stickerRules.deleteById(id);
    logger.info('unlearn_sticker succeeded', { id });
    return { toolName: TOOL_NAME, success: true, silent: false, result: JSON.stringify({ id }) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('unlearn_sticker failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'unlearn-sticker',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Forget a previously learned sticker so it stops being suggested or sent. Call this when the user asks to remove, forget, or stop using a sticker rule, or says a learned sticker no longer fits. Use the id from the "Learned Stickers" list — do not invent one.',
        parameters: {
          id: { type: 'string', required: true, description: 'The id of the learned sticker to forget, from the "Learned Stickers" list.' },
        },
        handler: (logger, args, execContext) => unlearnSticker(logger, args, execContext, context.stickerRules),
        enabled: (opts) => opts.trusted && opts.stickersEnabled && context.pluginEnablement.isEnabled('unlearn-sticker'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
