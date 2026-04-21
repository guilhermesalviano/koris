import type { AIToolDefinition } from '../types/provider';
import { Skill } from '../types/skills';

interface IToolsRepository {
  getAll(skills?: Skill[]): AIToolDefinition[];
  getSkillTool(skills: Skill[]): AIToolDefinition;
  getCurlTool(): AIToolDefinition;
}

/**
 * Repository for managing AI tool definitions
 * Handles creation and aggregation of tools for the AI provider
 */
class ToolsRepository implements IToolsRepository {
  /**
   * Get all available tools
   * Includes: get_skill (for skills), curl_request (for HTTP)
   */
  getAll(skills?: Skill[]): AIToolDefinition[] {
    // this.logger.debug('Building AI tools', { skillCount: skills?.length ?? 0 });

    let tools: AIToolDefinition[] = [];

    if (skills && skills.length > 0) {
      tools.push(this.createSkillsTool(skills));
    }

    // Always add curl tool for HTTP requests
    tools.push(this.createCurlTool());

    // Clone parameters to avoid mutation
    const result = tools.map((tool) => ({
      type: tool.type,
      function: {
        ...tool.function,
        parameters: structuredClone(tool.function.parameters),
      },
    }));

    // this.logger.debug('AI tools built', { toolCount: result.length, toolNames: result.map(t => t.function.name) });
    return result;
  }

  /**
   * Get get_skill tool for loading skill definitions
   */
  getSkillTool(skills: Skill[]): AIToolDefinition {
    return this.createSkillsTool(skills);
  }

  /**
   * Get curl_request tool for HTTP calls
   */
  getCurlTool(): AIToolDefinition {
    return this.createCurlTool();
  }

  /**
   * Create get_skill tool definition
   * Used by AI to read skill documentation from SKILL.md files
   */
  private createSkillsTool(skills: Skill[]): AIToolDefinition {
    const skillList = skills
      .map(s => `- ${s.name}: ${s.path}`)
      .join('\n');

    return {
      type: 'function',
      function: {
        name: 'get_skill',
        description: 'Read the complete SKILL.md file for a specific skill.',
        parameters: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: `Name of the skill to read. Skills: ${skills.map(s => `- ${s.name}: ${s.description}`).join('\n')}`,
            },
            skill_path: {
              type: 'string',
              description: `Path to the skill directory containing SKILL.md. Skills path: ${skillList}`,
            },
          },
          required: ['skill_name', 'skill_path'],
        },
      },
    };
  }

  /**
   * Create curl_request tool definition
   * Used by AI to make HTTP requests to APIs
   */
  private createCurlTool(): AIToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'curl_request',
        description: 'Execute HTTP requests using curl. Use only parameters explicitly required by the selected skill. Do not invent extra shell transformations.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to request (required). Keep values exactly as required by the skill.',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
              description: 'HTTP method (default: GET)',
            },
            headers: {
              type: 'object',
              description: 'Custom HTTP headers. Example: {"Authorization": "Bearer token", "Content-Type": "application/json"}',
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
              description: 'Optional: pipe the response through a command. Examples "| jq \'.fact\'", "| grep search_term", "| head -5". Useful for extracting specific data from JSON or text responses.',
            },
          },
          required: ['url'],
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