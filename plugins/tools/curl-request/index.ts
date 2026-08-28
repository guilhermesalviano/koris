import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import type { ILogger, Plugin, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import {
  execFilePromise,
  getOptionalBooleanArg,
  getOptionalDataArg,
  getOptionalNumberArg,
  getOptionalStringArg,
  getOptionalStringRecord,
  getRequiredStringArg,
  isAllowedValue,
} from '../runtime';
import { toCurlCommand } from './curl-command';

export const TOOL_NAME = 'curl_request' as const;

/**
 * Parse a jq pipe string (e.g. "| jq -r '.result'") into a safe argv array
 * for jq. Returns null when the pipe is not a valid jq invocation or contains
 * unclosed quotes.
 */
export function parseJqArgs(pipe: string): string[] | null {
  const normalized = pipe.trim().replace(/^\|\s*/, '');

  if (!/^jq\b/i.test(normalized)) return null;

  return shellWords(normalized.slice(2).trim());
}

export function shellWords(input: string): string[] | null {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else current += ch;
    } else if (inDouble) {
      if (ch === '"') { inDouble = false; }
      else if (ch === '\\' && i + 1 < input.length) { current += input[++i]; }
      else { current += ch; }
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (/\s/.test(ch)) {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }

  if (inSingle || inDouble) return null; // Unclosed quotes
  if (current) args.push(current);
  return args;
}

export function buildCurlArgs(
  encodedUrl: string,
  method: string,
  followRedirects: boolean,
  headers: Record<string, string> | null,
  data: string | null,
  includeStatusMarker: boolean,
): string[] {
  const args: string[] = ['-s', '-k'];

  if (followRedirects) args.push('-L');
  args.push('-X', method);

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      args.push('-H', `${key}: ${value}`);
    }
  }

  if (data) args.push('-d', data);

  args.push(encodedUrl);

  if (includeStatusMarker) {
    args.push('-w', '\n---HTTP_STATUS:%{http_code}---');
  }

  return args;
}

/** Spawn curl and pipe its stdout into jq — no shell involved. */
function curlPipeJq(curlArgs: string[], jqArgs: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const curlProc = spawn('curl', curlArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const jqProc   = spawn('jq',   jqArgs,   { stdio: ['pipe',   'pipe', 'pipe'] });

    curlProc.stdout.pipe(jqProc.stdin);

    let output = '';
    let errOutput = '';
    jqProc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    jqProc.stderr.on('data', (chunk: Buffer) => { errOutput += chunk.toString(); });

    const timer = setTimeout(() => {
      curlProc.kill();
      jqProc.kill();
      reject(new Error('timeout'));
    }, timeoutMs);

    jqProc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`jq exited with code ${code}: ${errOutput}`));
      else resolve(output);
    });

    curlProc.on('error', (err) => { clearTimeout(timer); reject(err); });
    jqProc.on('error',   (err) => { clearTimeout(timer); reject(err); });
  });
}

export async function executeCurl(
  logger: ILogger,
  args: Record<string, unknown>,
  gateUrl: (url: string) => string | null,
): Promise<ToolResult> {
  let url = getRequiredStringArg(args, 'url');

  if (!url) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: url' };
  }

  // If the model passed a full shell command instead of just the URL, extract the URL from it.
  // Match the last argument that looks like a URL or bare hostname.
  if (/^\s*curl\s/i.test(url)) {
    const words = shellWords(url.trim().slice(url.trim().indexOf(' ')).trim()) ?? [];
    const extracted = [...words].reverse().find(
      (w) => /^https?:\/\//i.test(w) || /^[a-zA-Z0-9]/.test(w) && w.includes('.')
    );
    if (extracted) {
      logger.warn('curl_request received a shell command as URL; extracted URL', { original: url, extracted });
      url = extracted;
    }
  }

  if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
    url = `https://${url}`;
  }

  let encodedUrl: string;
  try {
    const urlObj = new URL(url);
    encodedUrl = urlObj.toString();
  } catch {
    return { toolName: TOOL_NAME, success: false, error: `Invalid URL: ${url}` };
  }

  const gateError = gateUrl(encodedUrl);
  if (gateError) {
    logger.warn('curl_request blocked by domain gate', { url: encodedUrl, error: gateError });
    return { toolName: TOOL_NAME, success: false, error: gateError };
  }

  const method = (getOptionalStringArg(args, 'method') || 'GET').toUpperCase();
  const timeout = getOptionalNumberArg(args, 'timeout', 30);
  const followRedirects = getOptionalBooleanArg(args, 'follow_redirects', true);
  const pipeRaw = getOptionalStringArg(args, 'pipe') || '';

  // Parse the jq pipe into a safe argv array (no shell involved).
  let jqArgs: string[] | null = null;
  if (pipeRaw) {
    jqArgs = parseJqArgs(pipeRaw);
    if (!jqArgs) {
      logger.warn('Rejected curl_request with invalid pipe argument', { pipe: pipeRaw });
      return {
        toolName: TOOL_NAME,
        success: false,
        error: "Invalid pipe. Only a single jq invocation is allowed (example: | jq -r '.result').",
      };
    }
  }

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
  if (!isAllowedValue(method, validMethods)) {
    return { toolName: TOOL_NAME, success: false, error: `Invalid HTTP method: ${method}` };
  }

  const headers = getOptionalStringRecord(args, 'headers');

  const data = ['POST', 'PUT', 'PATCH'].includes(method)
    ? getOptionalDataArg(args, 'data')
    : null;

  logger.info('curl command', {
    command: toCurlCommand({
      url: encodedUrl,
      method,
      headers,
      data,
      extra: ['-k', ...(followRedirects ? ['-L'] : [])],
    }),
    url: encodedUrl,
    method,
    timeout,
  });

  try {
    let output: string;
    let httpStatus = 0;

    if (jqArgs) {
      const curlArgs = buildCurlArgs(encodedUrl, method, followRedirects, headers, data, false);
      output = await curlPipeJq(curlArgs, jqArgs, timeout * 1000);
      // For piped requests HTTP status is not captured; treat jq success as 200.
      httpStatus = 200;
    } else {
      const curlArgs = buildCurlArgs(encodedUrl, method, followRedirects, headers, data, true);
      const raw = await execFilePromise('curl', curlArgs, timeout * 1000);
      // Parse the LAST status marker — curl may emit one per redirect hop, and
      // only the final code reflects the resolved request.
      const statusLines = raw.split('\n').filter(line => line.startsWith('---HTTP_STATUS:'));
      const statusLine = statusLines[statusLines.length - 1];
      httpStatus = statusLine
        ? parseInt(statusLine.replace(/---HTTP_STATUS:(\d{3})---/, '$1'), 10)
        : 0;
      output = raw.split('\n').filter(line => !line.startsWith('---HTTP_STATUS:')).join('\n').trim();
    }

    logger.info('curl request completed', {
      url,
      encodedUrl,
      method,
      httpStatus,
      responseSize: output.length,
      pipeUsed: !!jqArgs,
    });

    if (httpStatus >= 400) {
      logger.warn('curl request returned error status', { url, encodedUrl, method, httpStatus, response: output });
    }

    return {
      toolName: TOOL_NAME,
      success: httpStatus >= 200 && httpStatus < 300,
      result: `${output}`.slice(0, 20000),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('timeout')) {
      logger.warn('curl request timed out', { url, encodedUrl, method, timeout });
      return { toolName: TOOL_NAME, success: false, error: `Request timeout after ${timeout} seconds` };
    }
    logger.error('curl request failed', { url, encodedUrl, method, timeout, error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'curl-request',
    setup(registry) {
      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Execute HTTP requests using curl. Use only parameters explicitly required by the selected skill. Do not invent extra shell transformations.',
        parameters: {
          url: { type: 'string', required: true, description: 'URL to request. Keep values exactly as required by the skill.' },
          method: { type: 'string', enum: HTTP_METHODS, description: 'HTTP method (default: GET)' },
          headers: {
            type: 'object',
            description: 'Custom HTTP headers. Example: {"Authorization": "Bearer token", "Content-Type": "application/json"}',
          },
          data: {
            type: ['string', 'object'],
            description: 'Request body for POST/PUT/PATCH. Can be a JSON object (e.g. {"id": 1, "checked": 1}), a JSON string, or form data.',
          },
          follow_redirects: { type: 'boolean', description: 'Follow HTTP redirects (default: true)' },
          timeout: { type: 'number', description: 'Request timeout in seconds (default: 30)' },
          pipe: {
            type: 'string',
            description:
              'Optional: pipe the response through a command. Examples: "| jq \'.fact\'", "| grep search_term", "| head -5". Useful for extracting specific data from JSON or text responses.',
          },
        },
        handler: (logger, args) => executeCurl(logger, args, context.security.gateUrl),
        enabled: (opts) => opts.trusted && context.pluginEnablement.isEnabled('curl-request'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
