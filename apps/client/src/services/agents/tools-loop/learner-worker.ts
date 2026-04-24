import { ToolCall } from "../../../types/tools";
import { normalizeResponse } from "../../../utils/tool-calls";
import { LearnedSkillsRepositoryFactory } from "../../../repositories/learned-skills";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { messageProvider } from "../chat/message-provider";
import { LoopContext } from "./context";
import { config } from "../../../config";
import type { Message } from "../../../entities/message";
import { SKILL_LEARNING_PROMPT, SKILL_EXECUTION_PROMPT } from "../../../constants";
import { replacePlaceholders } from "../../../utils/prompt";

async function learnerWorker(
  toolCalls: ToolCall[],
  originalUserRequest: string,
  messageHistory: Message[],
  ctx: LoopContext
): Promise<string> {
  let accumulatedContext = "";
  const db = DatabaseServiceFactory.create();
  const skillsRepo = LearnedSkillsRepositoryFactory.create(db);

  if (toolCalls.length > 0) {
    const skillContent = await ctx.toolsQueue.handle(
      toolCalls,
      { model: config.AI.MODEL },
      ctx.signal
    );

    for (const toolCall of toolCalls) {
      const skillName = toolCall.arguments.name ?? toolCall.arguments.skill_name;
      if (skillName === "get_skill") {
        ctx.logger.warn(`Unexpected tool call "${toolCall.name}" in learnerWorker, skipping...`, { toolCall });
        continue;
      }
      const learningPrompt = replacePlaceholders(SKILL_LEARNING_PROMPT, { v1: skillName as string, v2: skillContent });
      accumulatedContext += learningPrompt;

      const checkIfSkillAlreadyLearned = skillsRepo.exists(skillName as string);

      try {
        if (!checkIfSkillAlreadyLearned) {
          skillsRepo.save({
            skill_name: skillName as string,
            skill_content: learningPrompt,
          });
          ctx.logger.info(`✓ Skill "${skillName}" learned and saved to database`);
        } else {
          ctx.logger.warn(`- Skill "${skillName}" learned but already exists in database, skipping save`);
        }
      } catch (error) {
        ctx.logger.error('Failed to save learned skill', { skillName, error });
        ctx.onProgress(`⚠ Skill "${skillName}" learned but failed to save to database`);
      }
    }
  }

  const prompt = replacePlaceholders(SKILL_EXECUTION_PROMPT, { v1: originalUserRequest, v2: accumulatedContext });
  const response = await messageProvider(
    ctx.logger,
    prompt,
    ctx.channel,
    ctx.options,
    messageHistory
  );

  return normalizeResponse(response);
}

export { learnerWorker };