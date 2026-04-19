import { config } from "../../../config";
import { Message } from "../../../entities/message";
import { ILogger } from "../../../infrastructure/logger";
import { ToolCall } from "../../../types/tools";
import { buildSkillLearningPrompt } from "../../../utils/prompt";
import { normalizeResponse, shouldSkipToolCall } from "../../../utils/tool-calls";
import { ToolsQueue } from "../../tools-queue";
import { LearnedSkillsRepositoryFactory } from "../../../repositories/learned-skills";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { messageProvider } from "../chat/message-provider";
import { ProcessOptions } from "../../../types/agents";

async function learnerWorker(
  toolCalls: ToolCall[],
  messageHistory: Message[],
  logger: ILogger,
  channel: string,
  toolsQueue: ToolsQueue,
  signal: AbortSignal,
  onProgress: (text: string) => void,
  options?: ProcessOptions
): Promise<string> {
  const toolsToExecute = toolCalls.filter(toolCall => 
    toolCall && !shouldSkipToolCall(toolCall, messageHistory, logger)
  );

  let accumulatedContext = "";
  const db = DatabaseServiceFactory.create();
  const skillsRepo = LearnedSkillsRepositoryFactory.create(db);

  if (toolsToExecute.length > 0) {
    const skillContent = await toolsQueue.handle(
      toolsToExecute,
      { model: config.AI.MODEL },
      signal
    );

    for (const toolCall of toolsToExecute) {
      if (toolCall.name === 'get_skill') {
        const skillName = toolCall.arguments.name ?? toolCall.arguments.skill_name;
        const learningPrompt = buildSkillLearningPrompt(skillName as string,skillContent);
        accumulatedContext += learningPrompt;

        try {
          skillsRepo.save({
            skill_name: skillName as string,
            skill_content: learningPrompt,
          });
          onProgress(`✓ Skill "${skillName}" learned and saved to database`);
        } catch (error) {
          logger.error('Failed to save learned skill', { skillName, error });
          onProgress(`⚠ Skill "${skillName}" learned but failed to save to database`);
        }
      }
    }
  }

  const response = await messageProvider(
    logger,
    accumulatedContext,
    channel,
    options,
    messageHistory
  );

  return normalizeResponse(response);
}

export { learnerWorker };