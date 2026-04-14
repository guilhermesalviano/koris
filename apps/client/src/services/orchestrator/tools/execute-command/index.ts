import { execSync } from 'node:child_process';
import { config } from "../../../../config";
import { ILogger } from '../../../../infrastructure/logger';
import { ToolResult } from '../../../../types/tools';

const BASE_DIR = config.BASE_DIR;

export async function executeCommand(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const command = args.command as string;

  if (!command) {
    return { toolName: 'execute_command', success: false, error: 'Missing required parameter: command' };
  }

  logger.warn('execute_command requested', { command });

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      cwd: BASE_DIR,
      maxBuffer: 10 * 1024 * 1024,
    });

    logger.info('execute_command executed', { command, outputSize: output.length });
    return {
      toolName: 'execute_command',
      success: true,
      result: output.slice(0, 5000), // Limit output
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('execute_command failed', { command, error: errorMsg });
    return { toolName: 'execute_command', success: false, error: errorMsg };
  }
}