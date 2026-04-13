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
          action: {
            type: 'string',
            enum: ['read'],
            description: 'Action to perform: "read" to get the full SKILL.md content',
          },
          skill_name: {
            type: 'string',
            description: `Name of the skill to read. Available skills: ${skills.map(s => s.name).join(', ')}`,
          },
          skill_path: {
            type: 'string',
            description: `Path to the skill directory containing SKILL.md. Available skills: ${skillList}`,
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