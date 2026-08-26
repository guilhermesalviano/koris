// Deliberate exception: this is the only tool plugin that reaches outside
// `plugins/` — into `scripts/scaffold-tool.ts`, the single shared
// template-writing implementation also used by the dev CLI
// (`pnpm scaffold:tool`). Every other tool plugin only reaches into its
// injected `ToolPluginContext`; this one exists specifically to let the
// agent scaffold new tool plugins from chat, so it has to write files.
import { scaffoldToolPlugin, type ScaffoldParameterSpec } from '../../../scripts/scaffold-tool';
import type { ILogger, Plugin, ToolDefinition, ToolPluginContext, ToolResult } from '../contracts';
import { COMMANDS } from '../contracts';
import { getRequiredStringArg } from '../runtime';
import { loadCreateToolConfig } from './config';

export const TOOL_NAME = 'create_tool' as const;

const PARAM_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

function parseParameters(raw: unknown): ScaffoldParameterSpec[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const parsed: ScaffoldParameterSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { name, type, description, required } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !name) return null;
    if (typeof type !== 'string' || !PARAM_TYPES.includes(type as typeof PARAM_TYPES[number])) return null;
    if (typeof description !== 'string' || !description) return null;
    parsed.push({ name, type: type as ScaffoldParameterSpec['type'], description, required: required === true });
  }
  return parsed;
}

export async function executeCreateTool(logger: ILogger, args: Record<string, unknown>): Promise<ToolResult> {
  const name = getRequiredStringArg(args, 'name');
  if (!name) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: name' };
  }

  const description = getRequiredStringArg(args, 'description');
  if (!description) {
    return { toolName: TOOL_NAME, success: false, error: 'Missing required parameter: description' };
  }

  const parameters = parseParameters(args.parameters);
  if (parameters === null) {
    return {
      toolName: TOOL_NAME,
      success: false,
      error: 'Invalid parameter: parameters must be an array of {name, type, description, required?} objects, with type one of ' + PARAM_TYPES.join(', ') + '.',
    };
  }

  try {
    const result = scaffoldToolPlugin({ name, description, parameters });

    logger.info('create_tool scaffolded a new plugin', { pluginName: result.pluginName, toolName: result.toolName });

    return {
      toolName: TOOL_NAME,
      success: true,
      // Never silent: the rebuild/restart notice must always reach the human.
      silent: false,
      result: JSON.stringify({
        createdFiles: result.createdFiles,
        toolName: result.toolName,
        status: 'not_active',
        notice: 'This tool is NOT usable yet. The plugin loader only discovers plugins at process startup, so it will not be callable until the project is rebuilt (pnpm build) and the process is restarted. Tell the user this explicitly — never say the new tool is ready to use.',
      }),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('create_tool failed', { error: errorMsg });
    return { toolName: TOOL_NAME, success: false, error: errorMsg };
  }
}

const SCHEMA = {
  description:
    'Scaffold a new tool plugin from a name, description, and parameter list. ' +
    'REQUIRES CONFIRMATION: this writes new source files to the server, and once built and deployed those files become executable code the agent can call. ' +
    'Before calling this tool, show the human the tool name, description, and parameter list you intend to scaffold, and ask them to confirm. Only call after explicit confirmation. ' +
    'IMPORTANT: the scaffolded tool is NOT usable immediately — the plugin loader only discovers plugins at process startup, so it will not be callable until the project is rebuilt (pnpm build) and the process is restarted. Never tell the user the new tool is ready to use without that step, and always relay the rebuild/restart requirement from this tool\'s result back to them.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Plugin folder name and base for the LLM tool name, in strict kebab-case (e.g. "weather-lookup"). Lowercase letters, digits, and single hyphens only — no leading/trailing/consecutive hyphens.',
      },
      description: {
        type: 'string',
        description: 'The LLM-facing description of what the new tool does — shown to the model when deciding whether to call it.',
      },
      parameters: {
        type: 'array',
        description: 'Optional list of parameters the new tool accepts. Each item: {name, type, description, required}. type must be one of: ' + PARAM_TYPES.join(', ') + '.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: PARAM_TYPES },
            description: { type: 'string' },
            required: { type: 'boolean' },
          },
          required: ['name', 'type', 'description'],
        },
      },
    },
    required: ['name', 'description'],
  },
};

export function create(_context: ToolPluginContext): Plugin | null {
  const cfg = loadCreateToolConfig();
  if (!cfg.enabled) {
    return null;
  }

  return {
    name: 'create-tool',
    setup(registry) {
      const definition: ToolDefinition = {
        name: TOOL_NAME,
        schema: SCHEMA,
        handler: (logger, args) => executeCreateTool(logger, args),
        enabled: (opts) => opts.trusted,
      };
      registry.extend(COMMANDS, definition);
    },
  };
}
