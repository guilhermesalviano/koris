import type { AIToolDefinition } from '../types/chat';
import { Skill } from '../types/skills';

interface GetAllOptions {
  includeBeatTools?: boolean;
}

interface IToolsRepository {
  getAll(options?: GetAllOptions): AIToolDefinition[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

class ToolsRepository implements IToolsRepository {

  constructor(private skills: Skill[]) {}

  getAll(options?: GetAllOptions): AIToolDefinition[] {
    const tools: AIToolDefinition[] = [];
    const includeBeatTools = options?.includeBeatTools ?? true;

    tools.push(this.curlTool());
    tools.push(this.searchTool());
    if (this.skills?.length > 0) tools.push(this.getSkillTool(this.skills));
    
    if (includeBeatTools) {
      tools.push(this.createBeatTool());
      tools.push(this.listBeatsTool());
      tools.push(this.updateBeatTool());
      tools.push(this.deleteBeatTool());
    }

    return tools;
  }

  private getSkillTool(skills: Skill[]): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_skill',
        description: `Read the complete SKILL.md documentation for a skill before executing any task that skill covers.
  Call this whenever you need implementation details, constraints, or required patterns for a task.
  <available_skills>${skills.map(s => `<skill><skill_name>${s.name}</skill_name><skill_description>${s.description}</skill_description></skill>`).join('')}</available_skills>`,
        parameters: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              enum: skills.map(s => s.name),
              description: 'The skill to read documentation for.',
            },
          },
          required: ['skill_name'],
        },
      },
    };
  }

  private curlTool(): AIToolDefinition {
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
              type: ['string', 'object'],
              description:
                'Request body for POST/PUT/PATCH. Can be a JSON object (e.g. {"id": 1, "checked": 1}), a JSON string, or form data.',
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

  private searchTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'search_engine',
        description: 'Perform a web search using Google Search API.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query string.',
            },
          },
          required: ['query'],
        },
      },
    };
  }

  private createBeatTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'set_beat',
        description:
          'Save a reminder or scheduled beat for the user. DEFAULT BEHAVIOR: always create a one-time beat by pinning the exact minute, hour, day-of-month, and month — NEVER use * for day-of-month or month unless the user explicitly asks for a recurring schedule (e.g. "every day", "every Monday", "every month"). Only use wildcard (*) fields when the user clearly requests a recurring pattern.',
        parameters: {
          type: 'object',
          properties: {
            beat: {
              type: 'string',
              description: 'Clear description of what the user wants to be reminded about or the beat to schedule.',
            },
            type: {
              type: 'string',
              enum: ['reminder', 'scheduled_beat'],
              description: 'Type of the beat (optional, defaults to "reminder"): "reminder" for one-time or recurring reminders to the user, "scheduled_beat" for automated background beats to be executed by the agent.',
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
          required: ['beat', 'cron_expression'],
        },
      },
    };
  }

  private listBeatsTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'list_beats',
        description: 'List all saved beats and scheduled beats. Call this when the user asks to see, check, or review their beats.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    };
  }

  private updateBeatTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'update_beat',
        description: 'Update an existing beat. Call this when the user wants to change the description, type, or schedule of a beat. Use list_beats first if the ID is not known.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The UUID of the beat to update.',
            },
            beat: {
              type: 'string',
              description: 'New description for the beat (optional).',
            },
            type: {
              type: 'string',
              enum: ['reminder', 'scheduled_beat'],
              description: 'New type for the beat (optional): "reminder" or "scheduled_beat".',
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

  private deleteBeatTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'delete_beat',
        description: 'Delete a beat by ID. Call this when the user wants to remove or cancel a beat. Use list_beats first if the ID is not known.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The UUID of the beat to delete.',
            },
          },
          required: ['id'],
        },
      },
    };
  }
}

class ToolsRepositoryFactory {
  static create(skills: Skill[]): ToolsRepository {
    return new ToolsRepository(skills);
  }
}

export { IToolsRepository, ToolsRepository, ToolsRepositoryFactory };