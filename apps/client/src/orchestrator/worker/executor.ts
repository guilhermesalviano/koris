import { execSync } from 'node:child_process';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { readFile } from 'fs/promises';
import { join } from 'node:path';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
}

const BASE_DIR = config.BASE_DIR;

/**
 * Execute a tool and return the result
 */
export async function executeTool(logger: ILogger, toolCall: ToolCall): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  logger.debug('Executing tool', { toolName: name, argsKeys: Object.keys(args || {}) });

  try {
    switch (name) {
      case 'execute_command':
        return await executeCommand(logger, args);
      case 'get_skill':
        return await executeGetSkill(logger, args);
      default:
        return {
          toolName: name,
          success: false,
          error: `Unknown tool: ${name}`,
        };
    }
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

async function executeCommand(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
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

async function executeGetSkill(
  logger: ILogger,
  args: ToolCall['arguments']
): Promise<ToolResult> {

  if (!args.skill_name || !args.skill_path) {
    logger.error('skill_name and skill_path are required.');
    throw new Error('skill_name and skill_path are required.');
  }

  const content = await readFile(join(String(args.skill_path), 'SKILL.md'), 'utf-8');
  return {
    toolName: 'execute_get_skill',
    success: true,
    result: content.slice(0, 5000),
  };
}

