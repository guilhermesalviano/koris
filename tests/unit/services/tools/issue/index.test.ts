import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { config } from '../../../../../src/config';
import { applyTestConfigDefaults } from '../../../../../tests/helpers/test-config';

vi.mock('../../../../../src/infrastructure/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../../src/infrastructure/logger')>();
  return {
    ...original,
    LoggerFactory: {
      ...original.LoggerFactory,
      create: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }) as any,
    },
  };
});

import { executeIssue } from '../../../../../src/services/tools/issue/index';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

function setGithubToken(value: string): void {
  Object.defineProperty(config.GITHUB, 'TOKEN', {
    value,
    configurable: true,
    writable: true,
  });
}

function setGithubOwner(value: string): void {
  Object.defineProperty(config.GITHUB, 'OWNER', {
    value,
    configurable: true,
    writable: true,
  });
}

applyTestConfigDefaults();

describe('issue tool (orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setGithubOwner('');
  });

  it('returns error when title is missing', async () => {
    const result = await executeIssue(mockLogger, {});

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter: title',
    });
  });

  it('returns error when owner and repo are missing', async () => {
    const result = await executeIssue(mockLogger, { title: 'Test issue' });

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter(s): owner and repo required to create a GitHub issue.',
    });
  });

  it('returns error naming only repo when owner falls back to config.GITHUB.OWNER', async () => {
    setGithubOwner('default-owner');

    const result = await executeIssue(mockLogger, { title: 'Test issue' });

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'Missing required parameter(s): repo required to create a GitHub issue.',
    });
  });

  it('uses config.GITHUB.OWNER as the owner when not provided in args', async () => {
    setGithubOwner('default-owner');
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/default-owner/repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeIssue(mockLogger, { title: 'Test issue', repo: 'repo' });

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/default-owner/repo/issues');
  });

  it('prefers an explicit owner arg over config.GITHUB.OWNER', async () => {
    setGithubOwner('default-owner');
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/explicit-owner/repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeIssue(mockLogger, { title: 'Test issue', owner: 'explicit-owner', repo: 'repo' });

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/explicit-owner/repo/issues');
  });

  it('returns formatted issue text when no GitHub token is configured', async () => {
    setGithubToken('');

    const result = await executeIssue(mockLogger, {
      title: 'Test issue',
      body: 'This is the body',
      owner: 'owner',
      repo: 'repo',
    });

    expect(result).toEqual({
      toolName: 'issue',
      success: true,
      result: 'Issue title: "Test issue"\n\nThis is the body\n\n---\n*GitHub API not configured - issue text generated above. To enable actual issue creation, set github.token in koris.json or the GITHUB_TOKEN environment variable.',
    });
  });

  it('creates the issue via the GitHub API when a token is configured', async () => {
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/owner/repo/issues/7', number: 7 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeIssue(mockLogger, {
      title: 'Test issue',
      body: 'This is the body',
      owner: 'owner',
      repo: 'repo',
    });

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
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/my%20org/my%20repo/issues/1', number: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeIssue(mockLogger, {
      title: 'Test issue',
      owner: 'my org',
      repo: 'my repo',
    });

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.github.com/repos/my%20org/my%20repo/issues');
  });

  it('returns an error when the GitHub API responds with a failure status', async () => {
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeIssue(mockLogger, {
      title: 'Test issue',
      owner: 'owner',
      repo: 'repo',
    });

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'GitHub API error (404): Not Found',
    });
  });

  it('returns an error when the GitHub API request throws', async () => {
    setGithubToken('gh-token');
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeIssue(mockLogger, {
      title: 'Test issue',
      owner: 'owner',
      repo: 'repo',
    });

    expect(result).toEqual({
      toolName: 'issue',
      success: false,
      error: 'network down',
    });
  });
});
