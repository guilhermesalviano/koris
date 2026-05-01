import { CommandFn, ToolCall, ToolResult } from '../../types/tools';
import { executeCurl } from './curl-request';
import { executeCommand } from './execute-command';
import { executeGetSkill } from './get-skill';
import { setTask } from './task/create';
import { listTasks } from './task/list';
import { updateTask } from './task/update';
import { deleteTask } from './task/delete';
import { ILogger } from '../../infrastructure/logger';

type Command = { [key: string]: CommandFn };

interface IAgnosticExecutionTool {
  handle(logger: ILogger, toolCall: ToolCall): Promise<ToolResult>;
}

class AgnosticExecutionTool {
  constructor(
    private COMMAND_MAP: Command
  ) { }

  async handle(logger: ILogger, toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;
    logger.debug('Executing tool', {
      toolName: name,
      args,
    });

    try {
      const command = this.COMMAND_MAP[name];
      if (command) return await command(logger, args);

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
      'execute_command': executeCommand,
      'get_skill': executeGetSkill,
      'curl_request': executeCurl,
      'set_task': setTask,
      'list_tasks': listTasks,
      'update_task': updateTask,
      'delete_task': deleteTask,
    };

    return new AgnosticExecutionTool(COMMAND_MAP);
  }
}

export { IAgnosticExecutionTool, AgnosticExecutionTool, AgnosticExecutionToolFactory };