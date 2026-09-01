import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { executeIssue, create } from './index';
import type { ToolDefinition, ToolPluginContext } from '../contracts';
import type { PluginRegistry } from '../../registry';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

function issue(args: Record<string, unknown>, defaultOwner = '', githubToken = '') {
  return executeIssue(mockLogger, args, defaultOwner, githubToken);
}

describe('issue tool (orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns error when title is missing', async () => {
    const result = await issue({});

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter: title',
    });
  });

  it('returns error when owner and repo are missing', async () => {
    const result = await issue({ title: 'Test issue' });

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter(s): owner and repo required to create a GitHub issue.',
    });
  });

  it('returns error naming only repo when owner falls back to the configured default owner', async () => {
    const result = await issue({ title: 'Test issue' }, 'default-owner');

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter(s): repo required to create a GitHub issue.',
    });
  });

  it('uses the configured default owner when not provided in args', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/default-owner/repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await issue({ title: 'Test issue', repo: 'repo' }, 'default-owner', 'gh-token');

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/default-owner/repo/issues');
  });

  it('prefers an explicit owner arg over the configured default owner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/explicit-owner/repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await issue({ title: 'Test issue', owner: 'explicit-owner', repo: 'repo' }, 'default-owner', 'gh-token');

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/explicit-owner/repo/issues');
  });

  it('returns formatted issue text when no GitHub token is configured', async () => {
    const result = await issue({
      title: 'Test issue',
      body: 'This is the body',
      owner: 'owner',
      repo: 'repo',
    }, '', '');

    expect(result).toEqual({
      toolName: 'issue',
      success: true,
      result: 'Issue title: "Test issue"\n\nThis is the body\n\n---\n*GitHub API not configured - issue text generated above. To enable actual issue creation, set github.token in koris.json or the GITHUB_TOKEN environment variable.',
    });
  });

  it('creates the issue via the GitHub API when a token is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/owner/repo/issues/7', number: 7 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await issue({
      title: 'Test issue',
      body: 'This is the body',
      owner: 'owner',
      repo: 'repo',
    }, '', 'gh-token');

    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'token gh-token',
      },
      body: JSON.stringify({ title: 'Test issue', body: 'This is the body' }),
    });
    expect(result).toEqual({
      toolName: 'issue',
      success: true,
      result: 'Issue created successfully!\nTitle: "Test issue"\nNumber: #7\nURL: https://github.com/owner/repo/issues/7',
    });
  });

  it('url-encodes owner and repo before calling the GitHub API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/my%20org/my%20repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await issue({
      title: 'Test issue',
      owner: 'my org',
      repo: 'my repo',
    }, '', 'gh-token');

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/my%20org/my%20repo/issues');
  });

  it('returns an error when the GitHub API responds with a failure status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await issue({
      title: 'Test issue',
      owner: 'owner',
      repo: 'repo',
    }, '', 'gh-token');

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'GitHub API error (404): Not Found',
    });
  });

  it('returns an error when the GitHub API request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await issue({
      title: 'Test issue',
      owner: 'owner',
      repo: 'repo',
    }, '', 'gh-token');

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'network down',
    });
  });
});

describe('create', () => {
  function register(isEnabled: () => boolean): ToolDefinition {
    const context = {
      config: { githubOwner: '', githubToken: '' },
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

  it('is disabled when the plugin is administratively disabled, even when trusted', () => {
    const definition = register(() => false);
    expect(definition.enabled({ trusted: true })).toBe(false);
  });
});
