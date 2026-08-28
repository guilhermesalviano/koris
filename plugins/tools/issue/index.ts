import type { ILogger, Plugin, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { defineTool } from '../define-tool';
import { getRequiredStringArg, getOptionalStringArg } from '../runtime';

export const TOOL_NAME = 'issue' as const;

export async function executeIssue(
  logger: ILogger,
  args: Record<string, unknown>,
  defaultOwner: string,
  githubToken: string,
): Promise<ToolResult> {
  const title = getRequiredStringArg(args, 'title');
  if (!title) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: title' };
  }

  const body = getOptionalStringArg(args, 'body');
  const owner = getOptionalStringArg(args, 'owner') || defaultOwner || undefined;
  const repo = getOptionalStringArg(args, 'repo');

  if (!owner || !repo) {
    const missing = [!owner && 'owner', !repo && 'repo'].filter(Boolean).join(' and ');
    return {
      toolName: TOOL_NAME,
      success: false,
      error: `Missing required parameter(s): ${missing} required to create a GitHub issue.`,
    };
  }

  if (!githubToken) {
    return {
      toolName: TOOL_NAME,
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
        toolName: TOOL_NAME,
        success: false,
        error: `GitHub API error (${result.status}): ${errorText}`,
      };
    }

    const data = (await result.json()) as Record<string, unknown>;
    logger.info('GitHub issue created', { issueUrl: data.html_url, issueNumber: data.number });

    return {
      toolName: TOOL_NAME,
      success: true,
      result: `Issue created successfully!\nTitle: "${title}"\nNumber: #${data.number}\nURL: ${data.html_url}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create GitHub issue', { error: errorMsg });
    return {
      toolName: TOOL_NAME,
      success: false,
      error: errorMsg,
    };
  }
}

export function create(context: ToolPluginContext): Plugin {
  return {
    name: 'issue',
    setup(registry) {
      const defaultOwner = context.config.githubOwner;
      const ownerDescription = defaultOwner
        ? `GitHub owner/organization. Defaults to "${defaultOwner}" if omitted — only provide/ask for this if the human wants a different owner.`
        : 'GitHub owner/organization (required if repo is provided).';
      const confirmationNote = defaultOwner
        ? `Before calling this tool, show the human the title/body/repo you derived (and the owner, defaulting to "${defaultOwner}" unless the human specifies otherwise) and ask them to confirm — if repo was not provided, ask for it explicitly as part of that same question instead of guessing or omitting it.`
        : 'Before calling this tool, show the human the title/body/owner/repo you derived and ask them to confirm — if owner or repo was not provided, ask for them explicitly as part of that same question instead of guessing or omitting them.';

      const definition = defineTool({
        name: TOOL_NAME,
        description:
          'Create a GitHub issue. If GitHub API is configured with owner/repo and a token, creates the issue via the GitHub API. Otherwise returns formatted issue text for manual creation. ' +
          "The human will usually describe the issue in free-form text, not as an explicit title/body — derive both from that description yourself: title is a short, clear summary (a few words); body is the fuller description, expanded from what the human said, without inventing details they didn't mention. " +
          `REQUIRES CONFIRMATION: this is a state-changing action. ${confirmationNote} Only call this tool after the human has explicitly confirmed in a follow-up message.`,
        parameters: {
          title: {
            type: 'string',
            required: true,
            description: 'The issue title. Derive a short, clear summary from the human\'s description — do not require them to phrase it as a title.',
          },
          body: {
            type: 'string',
            description: 'The issue body/description (optional). Derive it from the human\'s description, expanding on what they said without inventing new details.',
          },
          owner: { type: 'string', description: ownerDescription },
          repo: { type: 'string', description: 'GitHub repository name (required if owner is provided).' },
        },
        handler: (logger, args) => executeIssue(logger, args, context.config.githubOwner, context.config.githubToken),
        enabled: (opts) => opts.trusted && context.pluginEnablement.isEnabled('issue'),
      });
      registry.extend(COMMANDS, definition);
    },
  };
}
