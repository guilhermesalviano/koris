import { config } from "../../../../config";
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';
import {
  getOptionalStringArrayArg,
  getRequiredStringArg,
  spawnCommand,
} from '../shared/runtime';

const BASE_DIR = config.BASE_DIR;

const ALLOWED_COMMANDS = new Set([
  'ls', 
  'git', 
  'npm', 
  'cat',
  'echo',
]);

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1].replace(/\\"/g, '"'));
      continue;
    }

    if (match[2] !== undefined) {
      tokens.push(match[2].replace(/\\'/g, "'"));
      continue;
    }

    if (match[3] !== undefined) {
      tokens.push(match[3]);
    }
  }

  return tokens;
}

export async function executeCommand(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const rawCommand = getRequiredStringArg(args, 'command');
  const rawArgs = getOptionalStringArrayArg(args, 'args');

  if (!rawCommand) {
    return { toolName: 'execute_command', success: false, error: 'Missing required parameter: command' };
  }

  const tokenized = rawCommand.includes(' ') ? tokenizeCommand(rawCommand) : [rawCommand];
  const command = tokenized[0] ?? '';
  const commandArgs = rawArgs.length > 0 ? rawArgs : tokenized.slice(1);

  // 2. Authorization Gate: Reject any command not strictly defined in the allowlist
  if (!ALLOWED_COMMANDS.has(command)) {
    logger.warn('Unauthorized command execution attempt blocked', { command, commandArgs });
    return { toolName: 'execute_command', success: false, error: `Security Error: Command '${command}' is not authorized.` };
  }

  logger.warn('execute_command requested', { command, commandArgs });

  try {
    const result = await spawnCommand({
      command,
      args: commandArgs,
      cwd: BASE_DIR,
      shell: false,
    });

    if (result.code !== 0) {
      const errorMsg = `Command failed with code ${result.code}: ${result.stderr.slice(0, 1000)}`;
      logger.error('execute_command failed', { command, error: errorMsg });
      return { toolName: 'execute_command', success: false, error: errorMsg };
    }

    logger.info('execute_command executed successfully', { command, outputSize: result.stdout.length });
    return {
      toolName: 'execute_command',
      success: true,
      result: result.stdout.slice(0, 20000),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('execute_command setup failed', { command, error: errorMsg });
    return { toolName: 'execute_command', success: false, error: errorMsg };
  }
}