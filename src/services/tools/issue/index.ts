import { ILogger } from '../../../infrastructure/logger';
import { ToolResult } from '../../../types/tools';
import { getRequiredStringArg, getOptionalStringArg } from '../runtime';
import { config } from '../../../config';

export async function executeIssue(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const title = getRequiredStringArg(args, 'title');
  if (!title) {
    return { toolName: 'issue', success: false, error: 'Missing required parameter: title' };
  }

  const body = getOptionalStringArg(args, 'body');
  const owner = getOptionalStringArg(args, 'owner');
  const repo = getOptionalStringArg(args, 'repo');

  if (!owner || !repo) {
    return {
      toolName: 'issue',
      success: false,
      error: 'Missing required parameters: owner and repo are required to create a GitHub issue.',
    };
  }

  const githubToken = config.GITHUB.TOKEN;

  if (!githubToken) {
    return {
      toolName: 'issue',
      success: true,
      result: `Issue title: "${title}"\n\n${body || ''}\n\n---` +
        `\n*GitHub API not configured - issue text generated above. ` +
        `To enable actual issue creation, set github.token in koris.json or the GITHUB_TOKEN environment variable.`,
    };
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const payload = JSON.stringify({
    title,
    body,
  });

  try {
    const result = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${githubToken}`,
      },
      body: payload,
    });

    if (!result.ok) {
      const errorText = await result.text();
      logger.error('GitHub API error', { status: result.status, error: errorText });
      return {
        toolName: 'issue',
        success: false,
        error: `GitHub API error (${result.status}): ${errorText}`,
      };
    }

    const data = (await result.json()) as Record<string, unknown>;
    logger.info('GitHub issue created', { issueUrl: data.html_url, issueNumber: data.number });

    return {
      toolName: 'issue',
      success: true,
      result: `Issue created successfully!\nTitle: "${title}"\nNumber: #${data.number}\nURL: ${data.html_url}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create GitHub issue', { error: errorMsg });
    return {
      toolName: 'issue',
      success: false,
      error: errorMsg,
    };
  }
}
