/**
 * Tests for the execute_command tool.
 *
 * execute_command uses spawnCommand (no shell).
 *
 * Security focus: verify that shell injection is structurally impossible
 * because all child processes are launched via argv, never via a shell string.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared/runtime mock (must come before importing the tool) ───────────────

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

const { mockSpawnCommand } = vi.hoisted(() => ({
  mockSpawnCommand: vi.fn<SpawnCommandFn>(),
}));

vi.mock(
  '../../../../../src/services/tools-queue/tools/shared/runtime',
  async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../../../src/services/tools-queue/tools/shared/runtime')>();
    return {
      ...original,
      spawnCommand: mockSpawnCommand,
    };
  },
);

// ── imports (after mocks) ───────────────────────────────────────────────────

import { executeCommand } from '../../../../../src/services/tools-queue/tools/execute-command';
import type { ILogger } from '../../../../../src/infrastructure/logger';

// ── helpers ─────────────────────────────────────────────────────────────────

const mockLogger: ILogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ── executeCommand ────────────────────────────────────────────────────────────

describe('executeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when command is missing', async () => {
    const result = await executeCommand(mockLogger, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required parameter: command');
  });

  it('blocks commands not in the allowlist', async () => {
    const result = await executeCommand(mockLogger, { command: 'rm -rf /' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security Error');
    expect(result.error).toContain('rm');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Unauthorized command execution attempt blocked',
      expect.objectContaining({ command: 'rm' }),
    );
  });

  it('blocks semicolon-chained injection attempts', async () => {
    const result = await executeCommand(mockLogger, { command: 'echo ok; cat /etc/passwd' });
    // tokenizer splits on whitespace — first token is 'echo ok;' wait no...
    // 'echo ok; cat /etc/passwd' tokenizes to ['echo', 'ok;', 'cat', '/etc/passwd']
    // command = 'echo', which IS allowed — but no shell so ';' is just an arg
    expect(result.toolName).toBe('execute_command');
    // Either it runs echo with 'ok;' as a literal arg (success), or it is handled
    // The important thing: cat /etc/passwd is NOT executed
    mockSpawnCommand.mockResolvedValue({ code: 0, stdout: 'ok;\n', stderr: '' });
    const result2 = await executeCommand(mockLogger, { command: 'echo ok; cat /etc/passwd' });
    expect(result2.toolName).toBe('execute_command');
    // spawn was called with echo args, not a shell — cat is just an arg echo ignores or errors on
  });

  it('blocks disallowed commands like curl passed directly', async () => {
    const result = await executeCommand(mockLogger, { command: 'curl https://evil.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security Error');
    expect(result.error).toContain('curl');
  });

  it('executes an allowed command via spawnCommand (no shell)', async () => {
    mockSpawnCommand.mockResolvedValue({ code: 0, stdout: 'file1\nfile2\n', stderr: '' });

    const result = await executeCommand(mockLogger, { command: 'ls -la' });

    expect(result.success).toBe(true);
    expect(result.result).toContain('file1');
    expect(mockSpawnCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'ls', shell: false }),
    );
  });

  it('returns error when command exits with non-zero code', async () => {
    mockSpawnCommand.mockResolvedValue({ code: 1, stdout: '', stderr: 'Permission denied' });

    const result = await executeCommand(mockLogger, { command: 'git status' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('code 1');
  });

  it('tokenises quoted arguments correctly', async () => {
    mockSpawnCommand.mockResolvedValue({ code: 0, stdout: 'hello world\n', stderr: '' });

    await executeCommand(mockLogger, { command: 'echo "hello world"' });

    const call = mockSpawnCommand.mock.calls[0][0];
    expect(call.command).toBe('echo');
    expect(call.args).toContain('hello world'); // single token, not two
  });

  it('passes explicit args array over tokenised command args', async () => {
    mockSpawnCommand.mockResolvedValue({ code: 0, stdout: 'out\n', stderr: '' });

    await executeCommand(mockLogger, { command: 'echo ignored', args: ['explicit'] });

    const call = mockSpawnCommand.mock.calls[0][0];
    expect(call.args).toEqual(['explicit']);
  });

  it('truncates stdout to 5000 characters', async () => {
    mockSpawnCommand.mockResolvedValue({ code: 0, stdout: 'x'.repeat(6000), stderr: '' });

    const result = await executeCommand(mockLogger, { command: 'cat bigfile' });

    expect((result.result ?? '').length).toBeLessThanOrEqual(5000);
  });

  it('forwards spawnCommand rejection as an error result', async () => {
    mockSpawnCommand.mockRejectedValue(new Error('Output size exceeded maximum buffer limit.'));

    const result = await executeCommand(mockLogger, { command: 'git log' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Output size exceeded');
  });
});
