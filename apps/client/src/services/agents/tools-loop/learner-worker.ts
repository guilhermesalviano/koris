import { LearnedSkillsRepositoryFactory } from "../../../repositories/learned-skills";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { config } from "../../../config";
import { SKILL_LEARNING_PROMPT } from "../../../constants";
import { replacePlaceholders } from "../../../utils/prompt";
import type { LoopContext } from "./context";
import type { ToolCall } from "../../../types/tools";
import type { Message } from "../../../entities/message";

async function learnerWorker(
  toolCalls: ToolCall[],
  _originalUserRequest: string,
  _messageHistory: Message[],
  ctx: LoopContext
): Promise<boolean> {
  const model = { model: config.AI.MODEL };
  const db = DatabaseServiceFactory.create();
  const skillsRepo = LearnedSkillsRepositoryFactory.create(db);

  if (toolCalls.length === 0) return false;

  for (const toolCall of toolCalls) {
    const skillName = (toolCall.arguments.name ?? toolCall.arguments.skill_name) as string;
    if (skillName === "get_skill") {
      ctx.logger.warn(`Unexpected tool call "${toolCall.name}" in learnerWorker, skipping...`, { toolCall });
      continue;
    }

    const skillResults = await ctx.toolsQueue.handle(
      [ toolCall ],
      model,
      ctx.signal
    );
    const skillContent = skillResults
      .map((r) => r.success ? r.result ?? '' : r.error ?? '')
      .join('\n')
      .replace(/<GMAIL_GATEWAY_HOST>/g, config.GMAIL_GATEWAY_HOST);

    try {
      const learningPrompt = replacePlaceholders(
        SKILL_LEARNING_PROMPT,
        { v1: skillName, v2: skillContent }
      );

      if (!skillsRepo.exists(skillName as string)) {
        skillsRepo.save({ skill_name: skillName, skill_content: learningPrompt });
        ctx.logger.info(`✓ Skill "${skillName}" learned and saved to database`);
        continue;
      }
      ctx.logger.warn(`- Skill "${skillName}" learned but already exists in database, skipping save`);
    } catch (error) {
      ctx.logger.error('Failed to save learned skill', { skillName, error });
      ctx.onProgress(`⚠ Skill "${skillName}" learned but failed to save to database`);
      return false;
    }
  }
  return true;
}

export { learnerWorker };