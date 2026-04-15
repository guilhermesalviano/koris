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

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    return { toolName: 'curl_request', success: false, error: `Invalid HTTP method: ${method}` };
  }

  try {
    let curlCmd = `curl -s -w "\n---HTTP_STATUS:%{http_code}---" --max-time ${timeout}`;

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