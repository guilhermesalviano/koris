import { ILogger } from "../../../../infrastructure/logger";
import { execSync } from 'node:child_process';
import { URL } from 'node:url';
import { ToolResult } from "../../../../types/tools";

function isSafeJqPipe(pipe: string): boolean {
  const normalized = pipe.trim().replace(/^\|\s*/, '');

  if (!/^jq\b/i.test(normalized)) {
    return false;
  }

  // Basic shell-injection hardening while allowing jq filters.
  if (/[;&`$<>\n\r]/.test(normalized)) {
    return false;
  }

  return true;
}

export async function executeCurl(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  let url = args.url as string;

  if (!url) {
    return { toolName: 'curl_request', success: false, error: 'Missing required parameter: url' };
  }

  if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
    url = `https://${url}`;
  }

  let encodedUrl: string;
  try {
    const urlObj = new URL(url);
    encodedUrl = urlObj.toString();
  } catch {
    return { toolName: 'curl_request', success: false, error: `Invalid URL: ${url}` };
  }

  const method = (args.method as string) || 'GET';
  const timeout = (args.timeout as number) || 30;
  const followRedirects = args.follow_redirects !== false;
  const pipe = typeof args.pipe === 'string' ? args.pipe.trim() : '';
  const normalizedPipe = pipe.replace(/^\|\s*/, '');

  if (pipe && !isSafeJqPipe(pipe)) {
    logger.warn('Rejected curl_request with unsafe pipe argument', { pipe });
    return {
      toolName: 'curl_request',
      success: false,
      error: "Invalid pipe. Only a single jq pipe is allowed (example: | jq -r '.result').",
    };
  }

  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    return { toolName: 'curl_request', success: false, error: `Invalid HTTP method: ${method}` };
  }

  try {
    let curlCmd = 'curl -s';

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

    curlCmd += ` '${encodedUrl}'`;

    logger.debug('Executing curl request', {
      url,
      encodedUrl,
      method,
      timeout,
      pipe: normalizedPipe || 'none',
      command: curlCmd,
    });

    let output: string;
    let httpStatus = 0;

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
    }, timeout * 1000);

    try {
      if (normalizedPipe) {
        output = execSync(`${curlCmd} | ${normalizedPipe}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: '/bin/bash',
          timeout: timeout * 1000,
        });

        // For piped requests, use command success as success indicator.
        httpStatus = 200;
      } else {
        curlCmd += ' -w "\\n---HTTP_STATUS:%{http_code}---"';
        output = execSync(curlCmd, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: '/bin/bash',
          timeout: timeout * 1000,
        });

        const lines = output.split('\n');
        const statusLine = lines.find(line => line.startsWith('---HTTP_STATUS:'));
        httpStatus = statusLine ? parseInt(statusLine.replace('---HTTP_STATUS:', '').replace('---', ''), 10) : 0;
        output = lines.filter(line => !line.startsWith('---HTTP_STATUS:')).join('\n').trim();
      }

      clearTimeout(timeoutHandle);

      if (timedOut) {
        logger.warn('curl request timed out', { url, encodedUrl, method, timeout });
        return { toolName: 'curl_request', success: false, error: `Request timeout after ${timeout} seconds` };
      }
    } catch (execErr) {
      clearTimeout(timeoutHandle);

      if (timedOut || (execErr instanceof Error && execErr.message.includes('timeout'))) {
        logger.warn('curl request timed out', { url, encodedUrl, method, timeout });
        return { toolName: 'curl_request', success: false, error: `Request timeout after ${timeout} seconds` };
      }
      throw execErr;
    }

    logger.info('curl request completed', {
      url,
      encodedUrl,
      method,
      httpStatus,
      responseSize: output.length,
      pipeUsed: !!normalizedPipe,
    });

    if (httpStatus >= 400) {
      logger.warn('curl request returned error status', { url, encodedUrl, method, httpStatus, response: output });
    }

    return {
      toolName: 'curl_request',
      success: httpStatus >= 200 && httpStatus < 300,
      result: `${output}`.slice(0, 5000),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('curl request failed', { url, encodedUrl: 'N/A', method, timeout, error: errorMsg });
    return { toolName: 'curl_request', success: false, error: errorMsg };
  }
}
