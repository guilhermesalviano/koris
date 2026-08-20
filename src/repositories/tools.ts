import type { AIToolDefinition } from '../types/chat';

interface GetAllOptions {
  includeBeatTools?: boolean;
}

interface IToolsRepository {
  getAll(options?: GetAllOptions): AIToolDefinition[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

class ToolsRepository implements IToolsRepository {

  getAll(options?: GetAllOptions): AIToolDefinition[] {
    const tools: AIToolDefinition[] = [];
    const includeBeatTools = options?.includeBeatTools ?? true;

    tools.push(this.curlTool());
    tools.push(this.searchTool());

    if (includeBeatTools) {
      tools.push(this.createBeatTool());
      tools.push(this.listBeatsTool());
      tools.push(this.updateBeatTool());
      tools.push(this.deleteBeatTool());
    }

    tools.push(this.sendMessageTool());

    return tools;
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
        description:
          'Perform a web search using Google Search API. Supports country, language, recency, pagination and search type context.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query string.',
            },
            num: {
              type: 'number',
              description: 'Number of results to return (default: 5, max: 100).',
            },
            start: {
              type: 'number',
              description: 'Pagination offset (0 = first page, 10 = second page). Use to fetch later results.',
            },
            gl: {
              type: 'string',
              description: 'Country code (ISO 3166-1 alpha-2) to localize results, e.g. "br", "us", "de".',
            },
            hl: {
              type: 'string',
              description: 'Language code to localize results, e.g. "pt-br", "en".',
            },
            time_period: {
              type: 'string',
              enum: ['past_hour', 'past_day', 'past_week', 'past_month', 'past_year'],
              description: 'Recency filter to get only the latest results.',
            },
            search_type: {
              type: 'string',
              enum: ['web', 'news', 'images', 'video'],
              description: 'Search type (default: "web").',
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

  private sendMessageTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'send_message',
        description:
          'Start a new outbound message to someone through a channel (Telegram or WhatsApp). ' +
          'Provide the channel and the recipient target (Telegram chat id or WhatsApp JID). ' +
          '"content" must be the exact message body to send.',
        parameters: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              enum: ['telegram', 'whatsapp'],
              description: 'Channel to send through (required).',
            },
            target: {
              type: 'string',
              description: 'Recipient address on the channel (Telegram chat id or WhatsApp JID) (required).',
            },
            content: {
              type: 'string',
              description: 'Exact message body to send (required).',
            },
          },
          required: ['content', 'channel', 'target'],
        },
      },
    };
  }
}

class ToolsRepositoryFactory {
  static create(): ToolsRepository {
    return new ToolsRepository();
  }
}

export { IToolsRepository, ToolsRepository, ToolsRepositoryFactory };