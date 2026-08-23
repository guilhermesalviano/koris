import { CommandFn, ToolCall, ToolExecutionContext, ToolResult } from '../../types/tools';
import { executeCurl } from './curl-request';
import { executeSearch } from './search';
import { executeIssue } from './issue';
import { setBeat } from './beats/create';
import { listBeats } from './beats/list';
import { updateBeat } from './beats/update';
import { deleteBeat } from './beats/delete';
import { sendMessage } from './send-message';
import { learnSticker } from './learn-sticker';
import { sendSticker } from './send-sticker';
import { unlearnSticker } from './unlearn-sticker';
import { ILogger } from '../../infrastructure/logger';

type Command = { [key: string]: CommandFn };

interface IAgnosticExecutionTool {
  handle(logger: ILogger, toolCall: ToolCall, context?: ToolExecutionContext): Promise<ToolResult>;
}

class AgnosticExecutionTool {
  constructor(
    private COMMAND_MAP: Command
  ) { }

  async handle(logger: ILogger, toolCall: ToolCall, context?: ToolExecutionContext): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;
    logger.debug('Executing tool', {
      toolName: name,
      args,
    });

    try {
      const command = this.COMMAND_MAP[name];
      if (command) return await command(logger, args, context);

      return {
        toolName: name,
        success: false,
        error: `Unknown tool: ${name}`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Tool execution error', { toolName: name, error: errorMsg });
      return {
        toolName: name,
        success: false,
        error: errorMsg,
      };
    }
  }
}

class AgnosticExecutionToolFactory {
  static create(): AgnosticExecutionTool {
    const COMMAND_MAP: Command = {
      'curl_request': executeCurl,
      'search_engine': executeSearch,
      'issue': executeIssue,
      'set_beat': setBeat,
      'list_beats': listBeats,
      'update_beat': updateBeat,
      'delete_beat': deleteBeat,
      'send_message': sendMessage,
      'learn_sticker': learnSticker,
      'send_sticker': sendSticker,
      'unlearn_sticker': unlearnSticker,
    };

    return new AgnosticExecutionTool(COMMAND_MAP);
  }
}

export { IAgnosticExecutionTool, AgnosticExecutionTool, AgnosticExecutionToolFactory };