import { execSync } from 'node:child_process';
import { config } from '../../config';
import { ILogger } from '../../infrastructure/logger';
import { readFile } from 'fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';

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
      case 'curl_request':
        return await executeCurl(logger, args);
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

  logger.info('get_skill args: ', { skillName: args.skill_name, skillPath: args.skill_path });

  const content = await readFile(join(String(args.skill_path), 'SKILL.md'), 'utf-8');
  return {
    toolName: 'execute_get_skill',
    success: true,
    result: content.slice(0, 5000),
  };
}

async function executeCurl(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  
  if (!url) {
    return { toolName: 'curl_request', success: false, error: 'Missing required parameter: url' };
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return { toolName: 'curl_request', success: false, error: `Invalid URL: ${url}` };
  }

  const method = (args.method as string) || 'GET';
  const timeout = (args.timeout as number) || 30;
  const followRedirects = args.follow_redirects !== false;

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    return { toolName: 'curl_request', success: false, error: `Invalid HTTP method: ${method}` };
  }

  try {
    let curlCmd = `curl -s -w "\n---HTTP_STATUS:%{http_code}---" --max-time ${timeout}`;

    if (!followRedirects) {
      curlCmd += ' -L';
    }

    curlCmd += ` -X ${method}`;

    if (args.headers && typeof args.headers === 'object') {
      const headers = args.headers as Record<string, string>;
      for (const [key, value] of Object.entries(headers)) {
        curlCmd += ` -H "${key}: ${value}"`;
      }
    }

    if (args.data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      const data = args.data as string;
      curlCmd += ` -d '${data.replace(/'/g, "'\\''")}'`;
    }

    curlCmd += ` '${url}'`;

    logger.debug('Executing curl request', { url, method, timeout });

    const output = execSync(curlCmd, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.split('\n');
    const statusLine = lines.find(line => line.startsWith('---HTTP_STATUS:'));
    const httpStatus = statusLine ? parseInt(statusLine.replace('---HTTP_STATUS:', '').replace('---', ''), 10) : 0;

    const responseBody = lines.filter(line => !line.startsWith('---HTTP_STATUS:')).join('\n').trim();

    logger.info('curl request completed', { url, method, httpStatus, responseSize: responseBody.length });

    return {
      toolName: 'curl_request',
      success: httpStatus >= 200 && httpStatus < 300,
      result: `HTTP ${httpStatus}\n\n${responseBody}`.slice(0, 5000),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('curl request failed', { url, method, error: errorMsg });
    return { toolName: 'curl_request', success: false, error: errorMsg };
  }
}

