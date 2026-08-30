/**
 * Tests for the curl_request tool.
 *
 * curl_request uses execFilePromise + spawn (no shell).
 *
 * Security focus: verify that shell injection is structurally impossible
 * because all child processes are launched via argv, never via a shell string.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// ── shared/runtime mock (must come before importing the tools) ──────────────

type ExecFilePromiseFn = (command: string, args: string[], timeoutMs: number) => Promise<string>;
type SpawnCommandOptions = {
  command: string;
  args: string[];
  cwd?: string;
  shell?: boolean;
  maxOutputSize?: number;
};
type SpawnCommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};
type SpawnCommandFn = (options: SpawnCommandOptions) => Promise<SpawnCommandResult>;

const { mockExecFilePromise, mockSpawnCommand, mockSpawn } = vi.hoisted(() => ({
  mockExecFilePromise: vi.fn<ExecFilePromiseFn>(),
  mockSpawnCommand: vi.fn<SpawnCommandFn>(),
  mockSpawn: vi.fn(),
}));

vi.mock(
  '../runtime',
  async (importOriginal) => {
    const original = await importOriginal<typeof import('../runtime')>();
    return {
      ...original,
      execFilePromise: mockExecFilePromise,
      spawnCommand: mockSpawnCommand,
    };
  },
);

// ── node:child_process mock ─────────────────────────────────────────────────

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: mockSpawn };
});

// ── imports (after mocks) ───────────────────────────────────────────────────

import {
  parseJqArgs,
  shellWords,
  buildCurlArgs,
  executeCurl,
  create,
} from './index';
import type { ILogger, ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

// ── helpers ─────────────────────────────────────────────────────────────────

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const ALLOWED_DOMAINS = ['example.com', 'api.example.com'];

/** Fake domain gate matching the shape of `gateErrorForUrl`, scoped to ALLOWED_DOMAINS above. */
function fakeGateUrl(url: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return `Domain gate: unable to resolve a hostname from "${url}".`;
  }
  return ALLOWED_DOMAINS.includes(hostname)
    ? null
    : `Domain gate: "${hostname}" is not in allowed_domains. Add it to koris.json to allow this request. Allowed domains: ${ALLOWED_DOMAINS.join(', ')}.`;
}

function execute(args: Record<string, unknown>) {
  return executeCurl(mockLogger, args, fakeGateUrl);
}

/** Create a fake child-process with PassThrough stdio streams. */
function makeMockProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = new PassThrough();
  proc.kill = vi.fn();
  return proc;
}

/**
 * Wire up mockSpawn so that curl emits `body` and jq echoes `jqOutput` then
 * closes with `jqExitCode`.
 */
function setupPipedSpawn({
  curlBody = '{"ok":true}',
  jqOutput = '"true"',
  jqExitCode = 0,
  jqStderr = '',
}: {
  curlBody?: string;
  jqOutput?: string;
  jqExitCode?: number;
  jqStderr?: string;
} = {}) {
  const curlProc = makeMockProc();
  const jqProc   = makeMockProc();

  let spawnCallCount = 0;
  mockSpawn.mockImplementation(() => {
    spawnCallCount++;
    if (spawnCallCount === 1) {
      // First spawn → curl: push body then end stdout
      setImmediate(() => {
        curlProc.stdout.push(curlBody);
        curlProc.stdout.push(null);
      });
      return curlProc;
    }
    // Second spawn → jq: push output then close
    setImmediate(() => {
      if (jqOutput) jqProc.stdout.push(jqOutput);
      if (jqStderr) jqProc.stderr.push(jqStderr);
      jqProc.stdout.push(null);
      jqProc.stderr.push(null);
      jqProc.emit('close', jqExitCode);
    });
    return jqProc;
  });

  return { curlProc, jqProc };
}

// ── parseJqArgs ─────────────────────────────────────────────────────────────

describe('parseJqArgs', () => {
  it('accepts "| jq ." and returns the filter as argv', () => {
    expect(parseJqArgs('| jq .')).toEqual(['.']);
  });

  it('accepts flags and single-quoted filter', () => {
    expect(parseJqArgs("| jq -r '.result'")).toEqual(['-r', '.result']);
  });

  it('accepts flags and double-quoted filter', () => {
    expect(parseJqArgs('| jq -r ".result"')).toEqual(['-r', '.result']);
  });

  it('accepts multiple flags', () => {
    expect(parseJqArgs("| jq -r -c '.items[]'")).toEqual(['-r', '-c', '.items[]']);
  });

  it('accepts jq with no explicit filter', () => {
    expect(parseJqArgs('| jq')).toEqual([]);
  });

  it('is case-insensitive on "jq"', () => {
    expect(parseJqArgs('| JQ .')).toEqual(['.']);
  });

  it('returns null when pipe does not start with jq', () => {
    expect(parseJqArgs('| cat /etc/passwd')).toBeNull();
  });

  it('returns null for a bare bash invocation', () => {
    expect(parseJqArgs('| bash -c "echo pwned"')).toBeNull();
  });

  it('returns null for unclosed single quote', () => {
    expect(parseJqArgs("| jq -r '.foo")).toBeNull();
  });

  it('returns null for unclosed double quote', () => {
    expect(parseJqArgs('| jq -r ".foo')).toBeNull();
  });

  /**
   * Security: "| jq . | cat /etc/passwd" passes parseJqArgs because it
   * starts with jq — but the extra tokens become argv for jq itself, not a
   * shell command. No shell is ever invoked, so there is no injection.
   */
  it('injection attempt "| jq . | cat /etc/passwd" → parsed as jq argv, never as shell', () => {
    const argv = parseJqArgs('| jq . | cat /etc/passwd');
    // argv is not null — it's forwarded to jq as its own arguments
    expect(argv).toEqual(['.', '|', 'cat', '/etc/passwd']);
    // The important guarantee: spawn('jq', argv) is called, NOT a shell
  });

  it('injection with semicolon → parsed as jq argv', () => {
    const argv = parseJqArgs('| jq .; rm -rf /');
    expect(argv).toEqual(['.;', 'rm', '-rf', '/']);
  });

  it('injection with backtick → parsed as jq argv', () => {
    const argv = parseJqArgs('| jq `id`');
    expect(argv).toEqual(['`id`']);
  });

  it('rejects a token that merely contains "jq" (anchored match)', () => {
    expect(parseJqArgs('| xjq .')).toBeNull();
  });

  it('strips leading whitespace before the pipe', () => {
    expect(parseJqArgs('  | jq .')).toEqual(['.']);
  });

  it('strips multiple spaces after the leading pipe', () => {
    expect(parseJqArgs('|   jq .')).toEqual(['.']);
  });

  it('leaves a non-leading pipe untouched when no jq prefix precedes it', () => {
    expect(parseJqArgs('jq|')).toEqual(['|']);
  });

  it('rejects pipes that do not contain jq at all', () => {
    expect(parseJqArgs('| sort')).toBeNull();
  });
});

// ── shellWords ───────────────────────────────────────────────────────────────

describe('shellWords', () => {
  it('splits plain tokens on whitespace', () => {
    expect(shellWords('-r .foo')).toEqual(['-r', '.foo']);
  });

  it('does not emit empty tokens for repeated whitespace', () => {
    expect(shellWords('a  b')).toEqual(['a', 'b']);
  });

  it('unescapes a backslash and keeps the following char inside double quotes', () => {
    expect(shellWords('"a\\"b"')).toEqual(['a"b']);
  });

  it('does not let an escaped backslash swallow the next character', () => {
    expect(shellWords('"ab"')).toEqual(['ab']);
  });

  it('preserves content inside single quotes', () => {
    expect(shellWords("'.items[] | .name'")).toEqual(['.items[] | .name']);
  });

  it('preserves content inside double quotes', () => {
    expect(shellWords('".items[]"')).toEqual(['.items[]']);
  });

  it('handles backslash escape inside double quotes', () => {
    expect(shellWords('"foo\\"bar"')).toEqual(['foo"bar']);
  });

  it('handles empty input', () => {
    expect(shellWords('')).toEqual([]);
  });

  it('returns null on unclosed single quote', () => {
    expect(shellWords("'unclosed")).toBeNull();
  });

  it('returns null on unclosed double quote', () => {
    expect(shellWords('"unclosed')).toBeNull();
  });
});

// ── buildCurlArgs ────────────────────────────────────────────────────────────

describe('buildCurlArgs', () => {
  const URL = 'https://example.com/api';

  it('builds minimal GET args', () => {
    const args = buildCurlArgs(URL, 'GET', false, null, null, false);
    expect(args).toEqual(['-s', '-k', '-X', 'GET', URL]);
  });

  it('adds -L when followRedirects is true', () => {
    const args = buildCurlArgs(URL, 'GET', true, null, null, false);
    expect(args).toContain('-L');
  });

  it('adds -H for each header as a single argv element (no shell quoting)', () => {
    const args = buildCurlArgs(URL, 'GET', false, { Authorization: 'Bearer tok', 'X-Foo': 'bar' }, null, false);
    const headers = args.filter((_, i) => args[i - 1] === '-H');
    expect(headers).toContain('Authorization: Bearer tok');
    expect(headers).toContain('X-Foo: bar');
  });

  it('adds -d with data as a single argv element (no shell escaping needed)', () => {
    const payload = '{"name":"O\'Brien"}';
    const args = buildCurlArgs(URL, 'POST', false, null, payload, false);
    const idx = args.indexOf('-d');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(payload); // raw, no shell escaping
  });

  it('appends -w status marker when requested', () => {
    const args = buildCurlArgs(URL, 'GET', false, null, null, true);
    const wIdx = args.indexOf('-w');
    expect(wIdx).toBeGreaterThan(-1);
    expect(args[wIdx + 1]).toContain('HTTP_STATUS');
  });
});

// ── executeCurl ───────────────────────────────────────────────────────────────

describe('executeCurl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when url is missing', async () => {
    const result = await execute({});
    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Missing required parameter: url');
  });

  it('prepends https:// when protocol is absent', async () => {
    mockExecFilePromise.mockResolvedValue('hello\n---HTTP_STATUS:200---');
    const result = await execute({ url: 'example.com' });
    expect(result.success).toBe(true);
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs.join(' ')).toContain('https://example.com');
  });

  it('returns error for completely invalid URL', async () => {
    const result = await execute({ url: 'not a url at all!!' });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Invalid URL');
    expect(result.error).toContain('not a url at all!!');
  });

  it('blocks requests when the hostname is not in allowed_domains', async () => {
    const result = await execute({ url: 'https://evil.com' });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Domain gate');
    expect(result.error).toContain('evil.com');
    expect(result.error).toContain('allowed_domains');
    expect(mockExecFilePromise).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl_request blocked by domain gate',
      expect.objectContaining({ url: 'https://evil.com/', error: expect.stringContaining('evil.com') }),
    );
  });

  it('blocks requests to a disallowed subdomain of an allowed domain', async () => {
    const result = await execute({ url: 'https://sub.example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain gate');
    expect(result.error).toContain('sub.example.com');
    expect(mockExecFilePromise).not.toHaveBeenCalled();
  });

  it('returns error for disallowed HTTP method', async () => {
    const result = await execute({ url: 'https://example.com', method: 'HACK' });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Invalid HTTP method');
    expect(result.error).toContain('HACK');
  });

  it('returns error when pipe does not start with jq (injection blocked)', async () => {
    const result = await execute({
      url: 'https://example.com',
      pipe: '| bash -c "echo pwned"',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid pipe');
    expect(result.toolName).toBe('curl_request');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Rejected curl_request with invalid pipe argument',
      expect.objectContaining({ pipe: expect.stringContaining('bash') }),
    );
  });

  it('uses execFilePromise (no shell) for requests without a pipe', async () => {
    mockExecFilePromise.mockResolvedValue('{"status":"ok"}\n---HTTP_STATUS:200---');

    const result = await execute({ url: 'https://example.com' });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe('curl_request');
    expect(result.result).toContain('"status":"ok"');
    expect(mockSpawn).not.toHaveBeenCalled();
    // execFilePromise receives ('curl', [...argv], timeout) — no shell option
    expect(mockExecFilePromise).toHaveBeenCalledWith('curl', expect.any(Array), expect.any(Number));

    // followRedirects defaults to true → -L is added; status marker always requested
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).toContain('-L');
    expect(curlArgs).toContain('-w');
    const wIdx = curlArgs.indexOf('-w');
    expect(curlArgs[wIdx + 1]).toBe('\n---HTTP_STATUS:%{http_code}---');
  });

  it('forwards the exact timeout in milliseconds to execFilePromise', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    const result = await execute({ url: 'https://example.com', timeout: 7 });

    expect(result.success).toBe(true);
    expect(mockExecFilePromise).toHaveBeenCalledWith('curl', expect.any(Array), 7000);
  });

  it('does not prepend https:// when the URL already has a non-http scheme', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    const result = await execute({ url: 'ftp://example.com/file' });

    expect(result.success).toBe(true);
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs.join(' ')).toContain('ftp://example.com/file');
  });

  it('does not log the shell-command warning for a plain URL', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com' });

    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      'curl_request received a shell command as URL',
      expect.anything(),
    );
  });

  it('parses HTTP status from the marker line', async () => {
    mockExecFilePromise.mockResolvedValue('Not Found\n---HTTP_STATUS:404---');
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(false); // 404 is not 2xx
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl request returned error status',
      expect.objectContaining({ httpStatus: 404, response: 'Not Found' }),
    );
  });

  it('treats exactly 400 as an error status', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:400---');
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl request returned error status',
      expect.objectContaining({ httpStatus: 400 }),
    );
  });

  it('treats 300 as a non-2xx status', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:300---');
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
  });

  it('does not warn about error status when the request succeeds', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
    await execute({ url: 'https://example.com' });
    expect(mockLogger.warn).not.toHaveBeenCalledWith('curl request returned error status', expect.anything());
  });

  it('omits -L when follow_redirects is explicitly false', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
    await execute({ url: 'https://example.com', follow_redirects: false });
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).not.toContain('-L');
  });

  it('uses the last status marker when curl emits one per redirect hop', async () => {
    mockExecFilePromise.mockResolvedValue('{"ok":true}\n---HTTP_STATUS:302---\n---HTTP_STATUS:200---');
    const result = await execute({ url: 'https://example.com', follow_redirects: true });
    expect(result.success).toBe(true); // final hop was 200
    expect(result.result).toContain('"ok":true');
    expect(result.result).not.toContain('HTTP_STATUS');
  });

  it('includes headers as separate argv elements (not interpolated into a shell string)', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({
      url: 'https://example.com',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    const headerValues = curlArgs.filter((_: string, i: number) => curlArgs[i - 1] === '-H');
    expect(headerValues).toContain('Authorization: Bearer secret');
    expect(headerValues).toContain('Content-Type: application/json');
  });

  it('passes POST data as a single argv element without shell quoting', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:201---');

    const payload = '{"name":"O\'Brien & Co"}';
    await execute({ url: 'https://example.com', method: 'POST', data: payload });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    const dataIdx = curlArgs.indexOf('-d');
    expect(curlArgs[dataIdx + 1]).toBe(payload); // exact, unescaped
  });

  it('serializes an object data argument as JSON for the request body', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({
      url: 'https://example.com/api/todo',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: { id: 13, checked: 1 },
    });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    const dataIdx = curlArgs.indexOf('-d');
    expect(curlArgs[dataIdx + 1]).toBe('{"id":13,"checked":1}');
  });

  it('does not send an empty body when data is an empty string', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com', method: 'POST', data: '   ' });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).not.toContain('-d');
  });

  it('sends data for PUT requests', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com', method: 'PUT', data: 'payload' });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).toContain('PUT');
    expect(curlArgs).toContain('payload');
  });

  it('sends data for PATCH requests', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com', method: 'PATCH', data: 'payload' });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).toContain('PATCH');
    expect(curlArgs).toContain('payload');
  });

  it('ignores data for GET requests', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com', method: 'GET', data: 'payload' });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs).not.toContain('-d');
  });

  it('uses spawn (no shell) to pipe curl stdout into jq for piped requests', async () => {
    setupPipedSpawn({ curlBody: '{"key":"value"}', jqOutput: '"value"\n', jqExitCode: 0 });

    const result = await execute({
      url: 'https://example.com',
      pipe: "| jq -r '.key'",
    });

    expect(result.success).toBe(true);
    expect(result.result).toContain('"value"');
    expect(result.result).not.toContain('Stryker was here!');

    // spawn was called twice: once for curl, once for jq
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const [jqCmd, jqArgv] = mockSpawn.mock.calls[1];
    expect(jqCmd).toBe('jq');
    expect(jqArgv).toEqual(['-r', '.key']); // argv, no shell string

    // No status marker for piped requests; stdio must pipe stdout → jq stdin
    expect(mockSpawn).toHaveBeenCalledWith(
      'curl',
      expect.any(Array),
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    const curlArgs = mockSpawn.mock.calls[0][1];
    expect(curlArgs).not.toContain('-w');
    expect(mockSpawn).toHaveBeenCalledWith(
      'jq',
      expect.any(Array),
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    );

    // Completion is logged with the pipe flag set
    expect(mockLogger.info).toHaveBeenCalledWith(
      'curl request completed',
      expect.objectContaining({ httpStatus: 200, pipeUsed: true }),
    );
  });

  it('includes jq stderr in the error when jq exits non-zero', async () => {
    setupPipedSpawn({ jqExitCode: 3, jqOutput: '', jqStderr: 'jq: error: cannot compile\n' });

    const result = await execute({
      url: 'https://example.com',
      pipe: '| jq .',
    });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toBe('jq exited with code 3: jq: error: cannot compile\n');
    expect(result.error).not.toContain('Stryker was here!');
  });

  it('returns error when the curl process emits an error', async () => {
    const curlProc = makeMockProc();
    const jqProc = makeMockProc();
    let count = 0;
    mockSpawn.mockImplementation(() => (count++ === 0 ? curlProc : jqProc));

    const resultPromise = execute({ url: 'https://example.com', pipe: '| jq .' });
    curlProc.emit('error', new Error('curl crashed'));
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('curl crashed');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'curl request failed',
      expect.objectContaining({ error: 'curl crashed' }),
    );
  });

  it('returns error when the jq process emits an error', async () => {
    const curlProc = makeMockProc();
    const jqProc = makeMockProc();
    let count = 0;
    mockSpawn.mockImplementation(() => (count++ === 0 ? curlProc : jqProc));

    const resultPromise = execute({ url: 'https://example.com', pipe: '| jq .' });
    jqProc.emit('error', new Error('jq crashed'));
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('jq crashed');
  });

  it('returns timeout error for piped requests when jq never closes', async () => {
    const curlProc = makeMockProc();
    const jqProc = makeMockProc();
    mockSpawn.mockReturnValue(curlProc);
    mockSpawn.mockReturnValueOnce(curlProc);
    mockSpawn.mockReturnValueOnce(jqProc);

    const result = await execute({ url: 'https://example.com', pipe: '| jq .', timeout: 1 });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Request timeout after 1 seconds');
    expect(curlProc.kill).toHaveBeenCalled();
    expect(jqProc.kill).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl request timed out',
      expect.objectContaining({ timeout: 1 }),
    );
  });

  /**
   * Security: even if the pipe contains pipeline operators, spawn receives
   * them as literal argv strings to jq — no shell is ever invoked.
   */
  it('injection "| jq . | cat /etc/passwd" → spawn("jq", […]) called, NOT a shell', async () => {
    // jq fails because '|', 'cat', '/etc/passwd' are not valid jq filters
    setupPipedSpawn({ jqExitCode: 5, jqOutput: '' });

    const result = await execute({
      url: 'https://example.com',
      pipe: '| jq . | cat /etc/passwd',
    });

    // jq exited non-zero → failure
    expect(result.success).toBe(false);

    // Critically: spawn was used, not a shell
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const [jqCmd, jqArgv] = mockSpawn.mock.calls[1];
    expect(jqCmd).toBe('jq');
    // The pipe tokens arrive as harmless argv — no cat, no /etc/passwd execution
    expect(jqArgv).toContain('.');
    expect(jqArgv).toContain('|');
    expect(jqArgv).toContain('cat');
    // No third spawn for cat (no shell parsing)
    expect(mockSpawn).not.toHaveBeenCalledWith('cat', expect.anything(), expect.anything());
  });

  it('returns timeout error when execFilePromise rejects with timeout message', async () => {
    mockExecFilePromise.mockRejectedValue(new Error('Command timed out: timeout'));
    const result = await execute({ url: 'https://example.com', timeout: 1 });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toContain('Request timeout after 1 seconds');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl request timed out',
      expect.objectContaining({ timeout: 1 }),
    );
  });

  it('returns the error message when execFilePromise rejects for other reasons', async () => {
    mockExecFilePromise.mockRejectedValue(new Error('Connection refused'));
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe('curl_request');
    expect(result.error).toBe('Connection refused');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'curl request failed',
      expect.objectContaining({ error: 'Connection refused' }),
    );
  });

  it('logs the exact curl command before executing', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com', method: 'GET' });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'curl command',
      expect.objectContaining({
        command: 'curl -s -k -L https://example.com/',
        url: 'https://example.com/',
        method: 'GET',
      }),
    );
  });

  it('logs the curl command with headers and body data', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({
      url: 'https://example.com',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: '{"checked":1,"id":13}',
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'curl command',
      expect.objectContaining({
        command: "curl -s -k -L -X PUT -H 'Content-Type: application/json' -d '{\"checked\":1,\"id\":13}' https://example.com/",
      }),
    );
  });

  it('reports the piped completion with pipeUsed false for execFile requests', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await execute({ url: 'https://example.com' });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'curl request completed',
      expect.objectContaining({ httpStatus: 200, pipeUsed: false }),
    );
  });

  it('truncates response to 20000 characters', async () => {
    const longBody = 'x'.repeat(21000);
    mockExecFilePromise.mockResolvedValue(`${longBody}\n---HTTP_STATUS:200---`);
    const result = await execute({ url: 'https://example.com' });
    expect((result.result ?? '').length).toBeLessThanOrEqual(20000);
  });

  it('still parses the status when trailing text follows the last marker', async () => {
    mockExecFilePromise.mockResolvedValue('body\n---HTTP_STATUS:200---\ntrailing');
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'curl request completed',
      expect.objectContaining({ httpStatus: 200 }),
    );
  });

  it('trims leading and trailing whitespace from the response body', async () => {
    mockExecFilePromise.mockResolvedValue('  body  \n---HTTP_STATUS:200---');
    const result = await execute({ url: 'https://example.com' });
    expect(result.result).toBe('body');
  });

  it('keeps newlines between multi-line response bodies', async () => {
    mockExecFilePromise.mockResolvedValue('{"a":1}\n{"b":2}\n---HTTP_STATUS:200---');
    const result = await execute({ url: 'https://example.com' });
    expect(result.result).toBe('{"a":1}\n{"b":2}');
  });

  it('treats a response without any status marker as a failure', async () => {
    mockExecFilePromise.mockResolvedValue('plain body');
    const result = await execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
  });

  it('returns an error when a curl command has no extractable URL', async () => {
    const result = await execute({ url: 'curl foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.anything(),
    );
  });

  it('does not extract a URL from a non-curl url containing spaces', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
    const result = await execute({ url: 'abc curl https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.anything(),
    );
  });

  it('does not extract a URL-looking token that starts with a hyphen', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
    const result = await execute({ url: 'curl -foo.bar' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('extracts the URL from curl commands with leading whitespace', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
    const result = await execute({ url: '  curl https://example.com' });
    expect(result.success).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.objectContaining({ extracted: 'https://example.com' }),
    );
  });

  it('does not reject a fast success when a small timeout is provided', async () => {
    setupPipedSpawn({ jqOutput: '"value"\n', jqExitCode: 0 });

    const result = await execute({
      url: 'https://example.com',
      pipe: '| jq .',
      timeout: 5,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('does not time out a piped request while the processes are still completing', async () => {
    const curlProc = makeMockProc();
    const jqProc = makeMockProc();
    let count = 0;
    mockSpawn.mockImplementation(() => {
      count++;
      if (count === 1) return curlProc;
      setTimeout(() => {
        jqProc.stdout.push('"value"\n');
        jqProc.stdout.push(null);
        jqProc.stderr.push(null);
        jqProc.emit('close', 0);
      }, 50);
      return jqProc;
    });

    const result = await execute({
      url: 'https://example.com',
      pipe: '| jq .',
      timeout: 10,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ── URL normalization (shell command passed as url) ───────────────────────────

describe('executeCurl — URL normalization from shell command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');
  });

  /** Helper: return the URL argv element sent to curl (last non-flag arg). */
  function capturedUrl(): string {
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    // The URL is always the last arg before the optional -w marker
    const wIdx = curlArgs.indexOf('-w');
    const candidate = wIdx === -1 ? curlArgs[curlArgs.length - 1] : curlArgs[wIdx - 1];
    return candidate as string;
  }

  it('extracts plain URL from "curl https://example.com"', async () => {
    await execute({ url: 'curl https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.objectContaining({ original: 'curl https://example.com', extracted: 'https://example.com' }),
    );
  });

  it('extracts URL when silent flag -s precedes it', async () => {
    await execute({ url: 'curl -s https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('extracts URL when multiple flags (-s -L) precede it', async () => {
    await execute({ url: 'curl -s -L https://example.com/path' });
    expect(capturedUrl()).toBe('https://example.com/path');
  });

  it('does not mistake -X flag value as the URL', async () => {
    await execute({ url: 'curl -X GET https://api.example.com' });
    expect(capturedUrl()).toBe('https://api.example.com/');
  });

  it('does not mistake -H header value as the URL', async () => {
    await execute({ url: "curl -H 'Authorization: Bearer tok' https://api.example.com" });
    expect(capturedUrl()).toBe('https://api.example.com/');
  });

  it('extracts single-quoted URL from "curl \'https://example.com\'"', async () => {
    await execute({ url: "curl 'https://example.com'" });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('extracts double-quoted URL from \'curl "https://example.com"\'', async () => {
    await execute({ url: 'curl "https://example.com"' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('preserves query string and path in the extracted URL', async () => {
    await execute({ url: 'curl https://api.example.com/v1/search?q=hello&limit=10' });
    expect(capturedUrl()).toContain('https://api.example.com/v1/search');
  });

  it('is case-insensitive on the leading "curl" keyword', async () => {
    await execute({ url: 'CURL https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('extracts a bare hostname URL from a curl invocation', async () => {
    await execute({ url: 'curl example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.objectContaining({ original: 'curl example.com', extracted: 'example.com' }),
    );
  });

  it('prefers the last URL-like token when flags follow the URL', async () => {
    await execute({ url: 'curl -o out.txt https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('does not treat a bare flag like -v as the URL', async () => {
    // Flags start with '-', so they fail both URL-pattern checks and are skipped
    await execute({ url: 'curl -v https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('handles combined flags and method before URL without misidentification', async () => {
    await execute({ url: 'curl -s -X POST https://api.example.com/items' });
    expect(capturedUrl()).toBe('https://api.example.com/items');
  });
});

describe('create', () => {
  function fakeContext(isEnabled: () => boolean): ToolPluginContext {
    return {
      security: { gateUrl: fakeGateUrl },
      pluginEnablement: { isEnabled },
    } as unknown as ToolPluginContext;
  }

  function register(context: ToolPluginContext): ToolDefinition {
    let registered: ToolDefinition | undefined;
    const fakeRegistry = {
      extend: vi.fn((_point, value: ToolDefinition) => { registered = value; }),
    } as unknown as PluginRegistry;
    create(context).setup(fakeRegistry);
    return registered!;
  }

  it('is enabled when trusted and the plugin is enabled', () => {
    const definition = register(fakeContext(() => true));
    expect(definition.enabled({ trusted: true, stickersEnabled: true })).toBe(true);
  });

  it('is disabled when the plugin is administratively disabled, even when trusted', () => {
    const definition = register(fakeContext(() => false));
    expect(definition.enabled({ trusted: true, stickersEnabled: true })).toBe(false);
  });
});
