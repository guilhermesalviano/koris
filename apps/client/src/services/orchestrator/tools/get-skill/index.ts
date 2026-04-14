import { ILogger } from "../../../../infrastructure/logger";
import { readFile } from 'fs/promises';
import { join } from 'node:path';
import { ToolCall, ToolResult } from "../../../../types/tools";

export async function executeGetSkill(
  logger: ILogger,
  args: ToolCall['arguments']
): Promise<ToolResult> {

  if (!args.skill_name || !args.skill_path) {
    logger.error('skill_name and skill_path are required.');
    throw new Error('skill_name and skill_path are required.');
  }

  logger.info('get_skill args: ', { skillName: args.skill_name, skillPath: args.skill_path });

  const content = await readFile(join(String(args.skill_path), 'SKILL.md'), 'utf-8');
  return {
    toolName: 'execute_get_skill',
    success: true,
    result: content.slice(0, 5000),
  };
}
