import type { AIToolDefinition } from '../types/provider';
import { Skill } from '../types/skills';

interface IToolsRepository {
  getAll(skills?: Skill[]): AIToolDefinition[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

function cloneTools(tools: AIToolDefinition[]): AIToolDefinition[] {
  return tools.map(({ type, function: fn }) => ({
    type,
    function: { ...fn, parameters: structuredClone(fn.parameters) },
  }));
}

function buildSkillList(skills: Skill[]): string {
  return skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
}

function skillsTool(skills: Skill[]): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'get_skill',
      description: `Read the complete SKILL.md documentation for a skill before executing any task that skill covers.
Call this whenever you need implementation details, constraints, or required patterns for a task.
Available skills:\n${buildSkillList(skills)}`,
      parameters: {
        type: 'object',
        properties: {
          skill_name: {
            type: 'string',
            enum: skills.map(s => s.name),
            description: 'The skill to read documentation for.',
          },
          skill_path: {
            type: 'string',
            description: 'Path to the skill directory containing SKILL.md.',
          },
        },
        required: ['skill_name', 'skill_path'],
      },
    },
  };
}

function curlTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'curl_request',
      description:
        'Execute HTTP requests using curl. Use only parameters explicitly required by the selected skill. Do not invent extra shell transformations.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to request (required). Keep values exactly as required by the skill.',
          },
          method: {
            type: 'string',
            enum: HTTP_METHODS,
            description: 'HTTP method (default: GET)',
          },
          headers: {
            type: 'object',
            description:
              'Custom HTTP headers. Example: {"Authorization": "Bearer token", "Content-Type": "application/json"}',
          },
          data: {
            type: 'string',
            description: 'Request body for POST/PUT/PATCH. Can be JSON string or form data.',
          },
          follow_redirects: {
            type: 'boolean',
            description: 'Follow HTTP redirects (default: true)',
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in seconds (default: 30)',
          },
          pipe: {
            type: 'string',
            description:
              'Optional: pipe the response through a command. Examples: "| jq \'.fact\'", "| grep search_term", "| head -5". Useful for extracting specific data from JSON or text responses.',
          },
        },
        required: ['url'],
      },
    },
  };
}

function createTaskTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'set_task',
      description:
        'Save a reminder or scheduled task for the user. DEFAULT BEHAVIOR: always create a one-time task by pinning the exact minute, hour, day-of-month, and month — NEVER use * for day-of-month or month unless the user explicitly asks for a recurring schedule (e.g. "every day", "every Monday", "every month"). Only use wildcard (*) fields when the user clearly requests a recurring pattern.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Clear description of what the user wants to be reminded about or the task to schedule.',
          },
          cron_expression: {
            type: 'string',
            description:
              'Standard 5-field cron expression. Format: "minute hour day-of-month month day-of-week". ' +
              'DEFAULT — one-time: always pin minute, hour, day-of-month and month to specific values (e.g. "30 9 15 6 *" = once on June 15th at 9:30am). ' +
              'ONLY use wildcards (*) when the user explicitly requests recurrence: ' +
              '"0 9 * * *" (every day at 9am), "0 9 * * 1" (every Monday at 9am), "0 8 1 * *" (1st of every month at 8am), "*/30 * * * *" (every 30 min).',
          },
        },
        required: ['task', 'cron_expression'],
      },
    },
  };
}

function listTasksTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List all saved tasks and scheduled tasks. Call this when the user asks to see, check, or review their tasks.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  };
}

function updateTaskTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update an existing task. Call this when the user wants to change the description or schedule of a task. Use list_tasks first if the ID is not known.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The UUID of the task to update.',
          },
          task: {
            type: 'string',
            description: 'New description for the task (optional).',
          },
          cron_expression: {
            type: 'string',
            description: 'New 5-field cron expression for the schedule (optional). Examples: "0 9 * * *" (daily at 9am), "0 9 * * 1" (every Monday at 9am).',
          },
        },
        required: ['id'],
      },
    },
  };
}

function deleteTaskTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task by ID. Call this when the user wants to remove or cancel a task. Use list_tasks first if the ID is not known.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The UUID of the task to delete.',
          },
        },
        required: ['id'],
      },
    },
  };
}

class ToolsRepository implements IToolsRepository {
  getAll(skills?: Skill[]): AIToolDefinition[] {
    const tools: AIToolDefinition[] = [];

    if (skills?.length) tools.push(skillsTool(skills));
    tools.push(curlTool());
    tools.push(createTaskTool());
    tools.push(listTasksTool());
    tools.push(updateTaskTool());
    tools.push(deleteTaskTool());

    return cloneTools(tools);
  }
}

class ToolsRepositoryFactory {
  static create(): ToolsRepository {
    return new ToolsRepository();
  }
}

export { IToolsRepository, ToolsRepository, ToolsRepositoryFactory };