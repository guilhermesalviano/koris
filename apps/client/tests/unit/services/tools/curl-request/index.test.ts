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
  '../../../../../src/services/tools/shared/runtime',
  async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../../../src/services/tools/shared/runtime')>();
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
} from '../../../../../src/services/tools/curl-request';
import type { ILogger } from '../../../../../src/infrastructure/logger';

// ── helpers ─────────────────────────────────────────────────────────────────

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

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
}: {
  curlBody?: string;
  jqOutput?: string;
  jqExitCode?: number;
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
      jqProc.stdout.push(null);
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
});

// ── shellWords ───────────────────────────────────────────────────────────────

describe('shellWords', () => {
  it('splits plain tokens on whitespace', () => {
    expect(shellWords('-r .foo')).toEqual(['-r', '.foo']);
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
    expect(args).toEqual(['-s', '-X', 'GET', URL]);
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
    const result = await executeCurl(mockLogger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required parameter: url');
  });

  it('prepends https:// when protocol is absent', async () => {
    mockExecFilePromise.mockResolvedValue('hello\n---HTTP_STATUS:200---');
    const result = await executeCurl(mockLogger, { url: 'example.com' });
    expect(result.success).toBe(true);
    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    expect(curlArgs.join(' ')).toContain('https://example.com');
  });

  it('returns error for completely invalid URL', async () => {
    const result = await executeCurl(mockLogger, { url: 'not a url at all!!' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('returns error for disallowed HTTP method', async () => {
    const result = await executeCurl(mockLogger, { url: 'https://example.com', method: 'HACK' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid HTTP method');
  });

  it('returns error when pipe does not start with jq (injection blocked)', async () => {
    const result = await executeCurl(mockLogger, {
      url: 'https://example.com',
      pipe: '| bash -c "echo pwned"',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid pipe');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Rejected curl_request with invalid pipe argument',
      expect.objectContaining({ pipe: expect.stringContaining('bash') }),
    );
  });

  it('uses execFilePromise (no shell) for requests without a pipe', async () => {
    mockExecFilePromise.mockResolvedValue('{"status":"ok"}\n---HTTP_STATUS:200---');

    const result = await executeCurl(mockLogger, { url: 'https://example.com' });

    expect(result.success).toBe(true);
    expect(result.result).toContain('"status":"ok"');
    expect(mockSpawn).not.toHaveBeenCalled();
    // execFilePromise receives ('curl', [...argv], timeout) — no shell option
    expect(mockExecFilePromise).toHaveBeenCalledWith('curl', expect.any(Array), expect.any(Number));
  });

  it('parses HTTP status from the marker line', async () => {
    mockExecFilePromise.mockResolvedValue('Not Found\n---HTTP_STATUS:404---');
    const result = await executeCurl(mockLogger, { url: 'https://example.com' });
    expect(result.success).toBe(false); // 404 is not 2xx
  });

  it('includes headers as separate argv elements (not interpolated into a shell string)', async () => {
    mockExecFilePromise.mockResolvedValue('\n---HTTP_STATUS:200---');

    await executeCurl(mockLogger, {
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
    await executeCurl(mockLogger, { url: 'https://example.com', method: 'POST', data: payload });

    const [, curlArgs] = mockExecFilePromise.mock.calls[0]!;
    const dataIdx = curlArgs.indexOf('-d');
    expect(curlArgs[dataIdx + 1]).toBe(payload); // exact, unescaped
  });

  it('uses spawn (no shell) to pipe curl stdout into jq for piped requests', async () => {
    setupPipedSpawn({ curlBody: '{"key":"value"}', jqOutput: '"value"\n', jqExitCode: 0 });

    const result = await executeCurl(mockLogger, {
      url: 'https://example.com',
      pipe: "| jq -r '.key'",
    });

    expect(result.success).toBe(true);
    expect(result.result).toContain('"value"');

    // spawn was called twice: once for curl, once for jq
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const [jqCmd, jqArgv] = mockSpawn.mock.calls[1];
    expect(jqCmd).toBe('jq');
    expect(jqArgv).toEqual(['-r', '.key']); // argv, no shell string
  });

  /**
   * Security: even if the pipe contains pipeline operators, spawn receives
   * them as literal argv strings to jq — no shell is ever invoked.
   */
  it('injection "| jq . | cat /etc/passwd" → spawn("jq", […]) called, NOT a shell', async () => {
    // jq fails because '|', 'cat', '/etc/passwd' are not valid jq filters
    setupPipedSpawn({ jqExitCode: 5, jqOutput: '' });

    const result = await executeCurl(mockLogger, {
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
    const result = await executeCurl(mockLogger, { url: 'https://example.com', timeout: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('truncates response to 20000 characters', async () => {
    const longBody = 'x'.repeat(21000);
    mockExecFilePromise.mockResolvedValue(`${longBody}\n---HTTP_STATUS:200---`);
    const result = await executeCurl(mockLogger, { url: 'https://example.com' });
    expect((result.result ?? '').length).toBeLessThanOrEqual(20000);
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
    await executeCurl(mockLogger, { url: 'curl https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'curl_request received a shell command as URL; extracted URL',
      expect.objectContaining({ original: 'curl https://example.com', extracted: 'https://example.com' }),
    );
  });

  it('extracts URL when silent flag -s precedes it', async () => {
    await executeCurl(mockLogger, { url: 'curl -s https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('extracts URL when multiple flags (-s -L) precede it', async () => {
    await executeCurl(mockLogger, { url: 'curl -s -L https://example.com/path' });
    expect(capturedUrl()).toBe('https://example.com/path');
  });

  it('does not mistake -X flag value as the URL', async () => {
    await executeCurl(mockLogger, { url: 'curl -X GET https://api.example.com' });
    expect(capturedUrl()).toBe('https://api.example.com/');
  });

  it('does not mistake -H header value as the URL', async () => {
    await executeCurl(mockLogger, { url: "curl -H 'Authorization: Bearer tok' https://api.example.com" });
    expect(capturedUrl()).toBe('https://api.example.com/');
  });

  it('extracts single-quoted URL from "curl \'https://example.com\'"', async () => {
    await executeCurl(mockLogger, { url: "curl 'https://example.com'" });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('extracts double-quoted URL from \'curl "https://example.com"\'', async () => {
    await executeCurl(mockLogger, { url: 'curl "https://example.com"' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('preserves query string and path in the extracted URL', async () => {
    await executeCurl(mockLogger, { url: 'curl https://api.example.com/v1/search?q=hello&limit=10' });
    expect(capturedUrl()).toContain('https://api.example.com/v1/search');
  });

  it('is case-insensitive on the leading "curl" keyword', async () => {
    await executeCurl(mockLogger, { url: 'CURL https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('does not treat a bare flag like -v as the URL', async () => {
    // Flags start with '-', so they fail both URL-pattern checks and are skipped
    await executeCurl(mockLogger, { url: 'curl -v https://example.com' });
    expect(capturedUrl()).toBe('https://example.com/');
  });

  it('handles combined flags and method before URL without misidentification', async () => {
    await executeCurl(mockLogger, { url: 'curl -s -X POST https://api.example.com/items' });
    expect(capturedUrl()).toBe('https://api.example.com/items');
  });
});
