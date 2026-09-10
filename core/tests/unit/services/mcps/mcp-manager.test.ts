import { describe, expect, it, vi } from 'vitest';
import type { Tool } from '@modelcontextprotocol/client';
import { PluginRegistry } from '../../../../../plugins/registry';
import { MCP_SERVERS, type McpServerDefinition } from '../../../../../plugins/mcps/contracts';
import { COMMANDS } from '../../../../../plugins/tools/contracts';
import { McpManager, describeError, exposedToolName, serializeResult, validatedUrl, type McpClientHandle } from '../../../../src/services/mcps/mcp-manager';

const logger = {
  info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
};

function definition(enabled: () => boolean): McpServerDefinition {
  return {
    name: 'coredash',
    enabled,
    loadConfig: () => ({ url: 'http://mac.local:3000/api/mcp' }),
  };
}

const remoteTool: Tool = {
  name: 'weather.lookup',
  description: 'Look up weather',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
};

describe('McpManager', () => {
  it('connects, registers namespaced tools, executes, and unregisters on disable', async () => {
    let enabled = false;
    const registry = new PluginRegistry();
    registry.extend(MCP_SERVERS, definition(() => enabled));
    const close = vi.fn(async () => undefined);
    const callTool = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'sunny' }] }));
    const client: McpClientHandle = {
      listTools: async () => ({ tools: [remoteTool] }),
      callTool,
      close,
    };
    const manager = new McpManager(logger, registry, registry.collect(MCP_SERVERS), async () => client);

    await manager.startAll();
    expect(registry.collect(COMMANDS)).toHaveLength(0);

    enabled = true;
    expect(await manager.enable('coredash')).toBe(true);
    const [tool] = registry.collect(COMMANDS);
    expect(tool?.name).toBe('coredash__weather_lookup');
    expect(tool?.enabled({ trusted: false })).toBe(false);
    await expect(tool?.handler(logger, { city: 'Sao Paulo' })).resolves.toMatchObject({ success: true, result: 'sunny' });
    expect(callTool).toHaveBeenCalledWith(
      { name: 'weather.lookup', arguments: { city: 'Sao Paulo' } },
      { toolDefinition: remoteTool },
    );

    enabled = false;
    expect(await manager.disable('coredash')).toBe(true);
    expect(registry.collect(COMMANDS)).toHaveLength(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it('shares one connect attempt between concurrent enables', async () => {
    const registry = new PluginRegistry();
    let resolveClient!: (handle: McpClientHandle) => void;
    const factory = vi.fn(() => new Promise<McpClientHandle>((resolve) => { resolveClient = resolve; }));
    const manager = new McpManager(logger, registry, [definition(() => true)], factory);

    const first = manager.enable('coredash');
    const second = manager.enable('coredash');
    resolveClient({ listTools: async () => ({ tools: [remoteTool] }), callTool: vi.fn(), close: vi.fn(async () => undefined) });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(factory).toHaveBeenCalledOnce();
    expect(registry.collect(COMMANDS)).toHaveLength(1);
  });

  it('disabling during a connect closes the client once it lands', async () => {
    const registry = new PluginRegistry();
    let resolveClient!: (handle: McpClientHandle) => void;
    const close = vi.fn(async () => undefined);
    const manager = new McpManager(logger, registry, [definition(() => true)], () => new Promise((resolve) => { resolveClient = resolve; }));

    const enabling = manager.enable('coredash');
    const disabling = manager.disable('coredash');
    resolveClient({ listTools: async () => ({ tools: [remoteTool] }), callTool: vi.fn(), close });
    await Promise.all([enabling, disabling]);

    expect(close).toHaveBeenCalledOnce();
    expect(registry.collect(COMMANDS)).toHaveLength(0);
    expect(manager.getStatuses()[0]?.state).toBe('disabled');
  });

  it('tells a server-reported tool error apart from a failed request', async () => {
    const registry = new PluginRegistry();
    const callTool = vi.fn()
      .mockResolvedValueOnce({ isError: true, content: [{ type: 'text' as const, text: 'fetch failed' }] })
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 192.168.3.196:3000') }));
    const manager = new McpManager(logger, registry, [definition(() => true)], async () => ({
      listTools: async () => ({ tools: [remoteTool] }),
      callTool,
      close: vi.fn(async () => undefined),
    }));
    await manager.enable('coredash');
    const [tool] = registry.collect(COMMANDS);

    await expect(tool?.handler(logger, {})).resolves.toEqual({
      toolName: 'coredash__weather_lookup',
      success: false,
      error: 'MCP server "coredash" returned an error: fetch failed',
    });
    await expect(tool?.handler(logger, {})).resolves.toEqual({
      toolName: 'coredash__weather_lookup',
      success: false,
      error: 'MCP request to "coredash" failed: fetch failed (connect ECONNREFUSED 192.168.3.196:3000)',
    });
  });

  it('records a connection failure without scheduling retries', async () => {
    const factory = vi.fn(async () => { throw new Error('offline'); });
    const manager = new McpManager(logger, new PluginRegistry(), [definition(() => true)], factory);
    await manager.startAll();
    expect(factory).toHaveBeenCalledOnce();
    expect(manager.getStatuses()).toEqual([{ name: 'coredash', state: 'error', toolCount: 0, error: 'offline' }]);
  });
});

describe('MCP adapters', () => {
  it('validates HTTP URLs and normalizes exposed names', () => {
    expect(validatedUrl('https://example.com/mcp').hostname).toBe('example.com');
    expect(() => validatedUrl('file:///tmp/mcp')).toThrow('http or https');
    expect(exposedToolName('coredash', 'a.b/c')).toBe('coredash__a_b_c');
    expect(() => exposedToolName('coredash', 'x'.repeat(60))).toThrow('exceeds 64 characters');
  });

  it('surfaces the network cause hidden behind "fetch failed"', () => {
    const error = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND mac.local') });
    expect(describeError(error)).toBe('fetch failed (getaddrinfo ENOTFOUND mac.local)');
    expect(describeError(new Error('offline'))).toBe('offline');
  });

  it('follows the cause the MCP SDK stores on SdkError.data', () => {
    const fetchError = new TypeError('fetch failed', { cause: new Error('unable to get local issuer certificate') });
    const sdkError = Object.assign(new Error('Version negotiation probe failed: fetch failed'), { data: { cause: fetchError } });
    expect(describeError(sdkError)).toBe(
      'Version negotiation probe failed: fetch failed (unable to get local issuer certificate)',
    );
  });

  it('preserves rich MCP result blocks as JSON', () => {
    expect(serializeResult({ content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }] })).toContain('image/png');
  });
});
