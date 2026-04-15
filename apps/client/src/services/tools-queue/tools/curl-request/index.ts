import { ILogger } from "../../../../infrastructure/logger";
import { execSync } from 'node:child_process';
import { URL } from 'node:url';
import { ToolResult } from "../../../../types/tools";

export async function executeCurl(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
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
  const pipe = (args.pipe as string) || ''; // Optional: pipe command like "| jq '.fact'"

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    return { toolName: 'curl_request', success: false, error: `Invalid HTTP method: ${method}` };
  }

  try {
    // Build curl command - don't include status marker when using pipe
    let curlCmd = `curl -s --max-time ${timeout}`;

    if (followRedirects) {
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

    logger.debug('Executing curl request', { url, method, timeout, pipe: pipe || 'none' });

    let output: string;
    let httpStatus = 0;

    if (pipe && pipe.trim()) {
      // When using pipe, execute curl and pipe the output
      const safePipe = pipe.trim().startsWith('|') ? pipe.trim() : `| ${pipe.trim()}`;
      output = execSync(`${curlCmd} ${safePipe}`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/bash',
      });
      
      // For piped requests, assume success (can't easily get status code)
      httpStatus = 200;
    } else {
      // Without pipe, include status marker
      curlCmd += ` -w "\n---HTTP_STATUS:%{http_code}---"`;
      output = execSync(curlCmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/bash',
      });

      const lines = output.split('\n');
      const statusLine = lines.find(line => line.startsWith('---HTTP_STATUS:'));
      httpStatus = statusLine ? parseInt(statusLine.replace('---HTTP_STATUS:', '').replace('---', ''), 10) : 0;
      output = lines.filter(line => !line.startsWith('---HTTP_STATUS:')).join('\n').trim();
    }

    logger.info('curl request completed', { url, method, httpStatus, responseSize: output.length, pipeUsed: !!pipe });

    return {
      toolName: 'curl_request',
      success: httpStatus >= 200 && httpStatus < 300,
      result: `${output}`.slice(0, 5000),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('curl request failed', { url, method, error: errorMsg });
    return { toolName: 'curl_request', success: false, error: errorMsg };
  }
}