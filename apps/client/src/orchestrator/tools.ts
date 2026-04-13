import type { AIToolDefinition } from '../types/provider';
import { Skill } from '../types/skills';

function createSkillsTool(skills: Skill[]): AIToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'get_skills',
      description: 
        'Get information about available skills and read their full documentation. ' +
        'This tool can list all skills or read the complete SKILL.md file for a specific skill.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read'],
            description: 
              "'list' to get all available skills with descriptions, " +
              "'read' to get the full SKILL.md content for a specific skill",
          },
          skill_name: {
            type: 'string',
            description: 
              'Name of the skill to read (required when action is "read"). ' +
              `Available skills: ${skills.map(s => s.name).join(', ')}`,
          },
        },
        required: ['action'],
      },
    },
  };
}

function buildAITools(skills?: Skill[]): AIToolDefinition[] {
  let tools: AIToolDefinition[] = [];
  
  if (skills && skills.length > 0) {
    tools.push(createSkillsTool(skills));
  }
  
  return tools.map((tool) => ({
    type: tool.type,
    function: {
      ...tool.function,
      parameters: structuredClone(tool.function.parameters),
    },
  }));
}

export { buildAITools, createSkillsTool };