import { spawn } from 'node:child_process';
import { config } from "../../../../config";
import type { ILogger } from '../../../../infrastructure/logger';
import type { ToolResult } from '../../../../types/tools';

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
  const rawCommand = typeof args.command === 'string' ? args.command.trim() : '';
  const rawArgs = Array.isArray(args.args) ? (args.args as string[]) : [];

  const tokenized = rawCommand.includes(' ') ? tokenizeCommand(rawCommand) : [rawCommand];
  const command = tokenized[0] ?? '';
  const commandArgs = rawArgs.length > 0 ? rawArgs : tokenized.slice(1);

  if (!command) {
    return { toolName: 'execute_command', success: false, error: 'Missing required parameter: command' };
  }

  // 2. Authorization Gate: Reject any command not strictly defined in the allowlist
  if (!ALLOWED_COMMANDS.has(command)) {
    logger.warn('Unauthorized command execution attempt blocked', { command, commandArgs });
    return { toolName: 'execute_command', success: false, error: `Security Error: Command '${command}' is not authorized.` };
  }

  logger.warn('execute_command requested', { command, commandArgs });

  // 3. Asynchronous Execution: Wrap spawn in a Promise for non-blocking execution
  return new Promise((resolve) => {
    try {
      const child = spawn(command, commandArgs, {
        cwd: BASE_DIR,
        shell: false,
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString('utf-8');

        if (output.length > 10 * 1024 * 1024) { 
          child.kill();
          resolve({ toolName: 'execute_command', success: false, error: 'Output size exceeded maximum buffer limit.' });
        }
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString('utf-8');
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = `Command failed with code ${code}: ${errorOutput.slice(0, 1000)}`;
          logger.error('execute_command failed', { command, error: errorMsg });
          resolve({ toolName: 'execute_command', success: false, error: errorMsg });
        } else {
          logger.info('execute_command executed successfully', { command, outputSize: output.length });
          resolve({
            toolName: 'execute_command',
            success: true,
            result: output.slice(0, 5000),
          });
        }
      });

      child.on('error', (err) => {
        logger.error('execute_command spawn error', { command, error: err.message });
        resolve({ toolName: 'execute_command', success: false, error: err.message });
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('execute_command setup failed', { command, error: errorMsg });
      resolve({ toolName: 'execute_command', success: false, error: errorMsg });
    }
  });
}