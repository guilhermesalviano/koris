import type { AIToolDefinition } from '../types/provider';
import { Skill } from '../types/skills';

function createSkillsTool(skills: Skill[]): AIToolDefinition {
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

function createCurlTool(): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'curl_request',
      description: 'Execute HTTP requests using curl. Useful for API calls, testing endpoints, and retrieving web data.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to request (required). Examples: https://api.github.com/users/github, https://jsonplaceholder.typicode.com/posts/1',
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
        },
        required: ['url'],
      },
    },
  };
}

function buildAITools(skills?: Skill[]): AIToolDefinition[] {
  let tools: AIToolDefinition[] = [];
  
  if (skills && skills.length > 0) {
    tools.push(createSkillsTool(skills));
  }

  // Always add curl tool
  tools.push(createCurlTool());
  
  return tools.map((tool) => ({
    type: tool.type,
    function: {
      ...tool.function,
      parameters: structuredClone(tool.function.parameters),
    },
  }));
}

export { buildAITools, createSkillsTool, createCurlTool };