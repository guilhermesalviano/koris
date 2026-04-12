import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../../app';
import { config } from '../../config';

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
 * Validate and normalize file paths to prevent directory traversal
 */
function validatePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  const resolved = path.resolve(BASE_DIR, normalized);

  // Ensure the resolved path is within BASE_DIR
  if (!resolved.startsWith(BASE_DIR)) {
    throw new Error(`Access denied: path is outside repository (${inputPath})`);
  }

  return resolved;
}

/**
 * Execute a tool and return the result
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  logger.debug('Executing tool', { toolName: name, argsKeys: Object.keys(args || {}) });

  try {
    switch (name) {
      case 'read_file':
        return await executeReadFile(args);
      case 'write_file':
        return await executeWriteFile(args);
      case 'list_dir':
        return await executeListDir(args);
      case 'search':
        return await executeSearch(args);
      case 'execute_command':
        return await executeCommand(args);
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

async function executeReadFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  if (!filePath) {
    return { toolName: 'read_file', success: false, error: 'Missing required parameter: path' };
  }

  try {
    const resolved = validatePath(filePath);
    const content = fs.readFileSync(resolved, 'utf-8');
    logger.info('read_file executed', { path: filePath, size: content.length });
    return {
      toolName: 'read_file',
      success: true,
      result: content,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { toolName: 'read_file', success: false, error: errorMsg };
  }
}

async function executeWriteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const content = args.content as string;

  if (!filePath) {
    return { toolName: 'write_file', success: false, error: 'Missing required parameter: path' };
  }
  if (typeof content !== 'string') {
    return { toolName: 'write_file', success: false, error: 'Missing required parameter: content' };
  }

  try {
    const resolved = validatePath(filePath);
    const dir = path.dirname(resolved);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolved, content, 'utf-8');
    logger.info('write_file executed', { path: filePath, size: content.length });
    return {
      toolName: 'write_file',
      success: true,
      result: `File written successfully: ${filePath}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { toolName: 'write_file', success: false, error: errorMsg };
  }
}

async function executeListDir(args: Record<string, unknown>): Promise<ToolResult> {
  const dirPath = args.path as string || '.';

  try {
    const resolved = validatePath(dirPath);

    if (!fs.existsSync(resolved)) {
      return { toolName: 'list_dir', success: false, error: `Path does not exist: ${dirPath}` };
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const formatted = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    }));

    logger.info('list_dir executed', { path: dirPath, count: formatted.length });
    return {
      toolName: 'list_dir',
      success: true,
      result: JSON.stringify(formatted, null, 2),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { toolName: 'list_dir', success: false, error: errorMsg };
  }
}

async function executeSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;

  if (!query) {
    return { toolName: 'search', success: false, error: 'Missing required parameter: query' };
  }

  try {
    // Use grep to search files
    const searchDir = validatePath('.');
    let output: string;

    try {
      // Search in source files only
      output = execSync(
        `grep -r "${query.replace(/"/g, '\\"')}" ${searchDir} --include="*.ts" --include="*.js" --include="*.json" 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch {
      output = '';
    }

    const lines = output.split('\n').filter((l) => l.trim()).slice(0, 50); // Limit to 50 results

    logger.info('search executed', { query, resultCount: lines.length });
    return {
      toolName: 'search',
      success: true,
      result: lines.length > 0 ? lines.join('\n') : `No matches found for: ${query}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { toolName: 'search', success: false, error: errorMsg };
  }
}

async function executeCommand(args: Record<string, unknown>): Promise<ToolResult> {
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
