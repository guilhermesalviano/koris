import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

type SpawnCommandResult = { stdout: string; stderr: string; code: number | null };
type SpawnCommandFn = (options: { command: string; args: string[]; cwd?: string; shell?: boolean; timeoutMs?: number }) => Promise<SpawnCommandResult>;

const { mockSpawnCommand } = vi.hoisted(() => ({
  mockSpawnCommand: vi.fn<SpawnCommandFn>(),
}));

vi.mock('../runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('../runtime')>();
  return { ...original, spawnCommand: mockSpawnCommand };
});

import { executeRestartSearchEngine, create, TOOL_NAME } from './index';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('restart_search_engine tool (orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports success and forwards stdout when the script exits 0', async () => {
    mockSpawnCommand.mockResolvedValue({ stdout: 'SearXNG is ready!\nAPI URL: http://localhost:8080\n', stderr: '', code: 0 });

    const result = await executeRestartSearchEngine(mockLogger, '/repo');

    expect(result.success).toBe(true);
    expect(result.toolName).toBe(TOOL_NAME);
    expect(result.result).toContain('SearXNG is ready!');
    expect(mockSpawnCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'bash',
        args: ['/repo/scripts/run_search_engine.sh', '--restart'],
      }),
    );
  });

  it('falls back to a generic success message when the script produced no output', async () => {
    mockSpawnCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const result = await executeRestartSearchEngine(mockLogger, '/repo');

    expect(result).toEqual({ toolName: TOOL_NAME, success: true, result: 'SearXNG restarted successfully.' });
  });

  it('reports failure with the script output when it exits non-zero', async () => {
    mockSpawnCommand.mockResolvedValue({
      stdout: 'Warning: SearXNG did not become ready within 60s, but container may still be starting.\n',
      stderr: '',
      code: 1,
    });

    const result = await executeRestartSearchEngine(mockLogger, '/repo');

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code 1');
    expect(result.error).toContain('did not become ready within 60s');
  });

  it('reports failure with code null when the command times out', async () => {
    mockSpawnCommand.mockResolvedValue({ stdout: '', stderr: '\n[timed out after 120000ms]', code: null });

    const result = await executeRestartSearchEngine(mockLogger, '/repo');

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code null');
    expect(result.error).toContain('timed out after 120000ms');
  });

  it('returns an error result when spawnCommand rejects', async () => {
    mockSpawnCommand.mockRejectedValue(new Error('spawn bash ENOENT'));

    const result = await executeRestartSearchEngine(mockLogger, '/repo');

    expect(result).toEqual({ toolName: TOOL_NAME, success: false, error: 'spawn bash ENOENT' });
  });

  it('defaults baseDir to process.cwd() when not provided', async () => {
    mockSpawnCommand.mockResolvedValue({ stdout: 'ok', stderr: '', code: 0 });

    await executeRestartSearchEngine(mockLogger);

    expect(mockSpawnCommand).toHaveBeenCalledWith(
      expect.objectContaining({ args: [expect.stringContaining('scripts/run_search_engine.sh'), '--restart'] }),
    );
  });
});

describe('create', () => {
  function register(isEnabled: () => boolean): ToolDefinition {
    const context = {
      pluginEnablement: { isEnabled },
    } as unknown as ToolPluginContext;
    let registered: ToolDefinition | undefined;
    const fakeRegistry = {
      extend: vi.fn((_point, value: ToolDefinition) => { registered = value; }),
    } as unknown as PluginRegistry;
    create(context).setup(fakeRegistry);
    return registered!;
  }

  it('is enabled when trusted and the plugin is enabled', () => {
    const definition = register(() => true);
    expect(definition.enabled({ trusted: true })).toBe(true);
  });

  it('is disabled when not trusted, even when the plugin is enabled', () => {
    const definition = register(() => true);
    expect(definition.enabled({ trusted: false })).toBe(false);
  });

  it('is disabled when the plugin is administratively disabled, even when trusted', () => {
    const definition = register(() => false);
    expect(definition.enabled({ trusted: true })).toBe(false);
  });

  it('requires confirmation and names the tool it fixes in its description', () => {
    const definition = register(() => true);
    expect(definition.schema.description).toContain('REQUIRES CONFIRMATION');
    expect(definition.schema.description).toContain('search_engine');
  });

  it('takes no parameters', () => {
    const definition = register(() => true);
    expect(definition.schema.parameters.properties).toEqual({});
    expect(definition.schema.parameters.required).toEqual([]);
  });
});
