import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockScaffold = vi.hoisted(() => vi.fn());

vi.mock('../../../scripts/scaffold-tool', () => ({
  scaffoldToolPlugin: mockScaffold,
}));

import { executeCreateTool, create } from './index';
import type { ILogger, ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

const logger: ILogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

describe('create_tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when name is missing', async () => {
    const result = await executeCreateTool(logger, { description: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('name');
    expect(mockScaffold).not.toHaveBeenCalled();
  });

  it('returns error when description is missing', async () => {
    const result = await executeCreateTool(logger, { name: 'weather-lookup' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
    expect(mockScaffold).not.toHaveBeenCalled();
  });

  it('returns error when parameters is not an array', async () => {
    const result = await executeCreateTool(logger, { name: 'weather-lookup', description: 'x', parameters: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('parameters');
    expect(mockScaffold).not.toHaveBeenCalled();
  });

  it('returns error when a parameter has an invalid type', async () => {
    const result = await executeCreateTool(logger, {
      name: 'weather-lookup',
      description: 'x',
      parameters: [{ name: 'city', type: 'symbol', description: 'City' }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('parameters');
    expect(mockScaffold).not.toHaveBeenCalled();
  });

  it('scaffolds the plugin and returns the rebuild/restart notice', async () => {
    mockScaffold.mockReturnValue({
      pluginName: 'weather-lookup',
      toolName: 'weather_lookup',
      createdFiles: ['weather-lookup/index.ts', 'weather-lookup/config.ts'],
    });

    const result = await executeCreateTool(logger, {
      name: 'weather-lookup',
      description: 'Look up the weather.',
      parameters: [{ name: 'city', type: 'string', description: 'City name', required: true }],
    });

    expect(mockScaffold).toHaveBeenCalledWith({
      name: 'weather-lookup',
      description: 'Look up the weather.',
      parameters: [{ name: 'city', type: 'string', description: 'City name', required: true }],
    });
    expect(result.success).toBe(true);
    expect(result.silent).toBe(false);
    const parsed = JSON.parse(result.result!);
    expect(parsed.status).toBe('not_active');
    expect(parsed.notice).toContain('restart');
    expect(parsed.createdFiles).toEqual(['weather-lookup/index.ts', 'weather-lookup/config.ts']);
  });

  it('returns error when the plugin already exists', async () => {
    mockScaffold.mockImplementation(() => { throw new Error('A tool plugin named "weather-lookup" already exists.'); });

    const result = await executeCreateTool(logger, { name: 'weather-lookup', description: 'x' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('defaults parameters to an empty array when omitted', async () => {
    mockScaffold.mockReturnValue({ pluginName: 'x', toolName: 'x', createdFiles: [] });

    await executeCreateTool(logger, { name: 'x', description: 'x' });

    expect(mockScaffold).toHaveBeenCalledWith({ name: 'x', description: 'x', parameters: [] });
  });
});

describe('create', () => {
  function register(isEnabled: () => boolean): ToolDefinition {
    const context = { pluginEnablement: { isEnabled } } as unknown as ToolPluginContext;
    let registered: ToolDefinition | undefined;
    const fakeRegistry = {
      extend: vi.fn((_point, value: ToolDefinition) => { registered = value; }),
    } as unknown as PluginRegistry;
    create(context).setup(fakeRegistry);
    return registered!;
  }

  it('is enabled when trusted and the plugin is enabled', () => {
    const definition = register(() => true);
    expect(definition.enabled({ trusted: true, stickersEnabled: true })).toBe(true);
  });

  it('is disabled when the plugin is administratively disabled, even when trusted', () => {
    const definition = register(() => false);
    expect(definition.enabled({ trusted: true, stickersEnabled: true })).toBe(false);
  });
});
