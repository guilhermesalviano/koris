import { config } from "../../../config";
import { Message } from "../../../entities/message";
import { ILogger } from "../../../infrastructure/logger";
import { ToolCall } from "../../../types/tools";
import { buildSkillLearningPrompt } from "../../../utils/prompt";
import { normalizeResponse } from "../../../utils/tool-calls";
import { ToolsQueue } from "../../tools-queue";
import { LearnedSkillsRepositoryFactory } from "../../../repositories/learned-skills";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { messageProvider } from "../chat/message-provider";
import { ProcessOptions } from "../../../types/agents";

async function learnerWorker(
  toolCalls: ToolCall[],
  originalUserRequest: string,
  messageHistory: Message[],
  logger: ILogger,
  channel: string,
  toolsQueue: ToolsQueue,
  signal: AbortSignal,
  onProgress: (text: string) => void,
  options?: ProcessOptions
): Promise<string> {
  let accumulatedContext = "";
  const db = DatabaseServiceFactory.create();
  const skillsRepo = LearnedSkillsRepositoryFactory.create(db);

  if (toolCalls.length > 0) {
    const skillContent = await toolsQueue.handle(
      toolCalls,
      { model: config.AI.MODEL },
      signal
    );

    for (const toolCall of toolCalls) {
      const skillName = toolCall.arguments.name ?? toolCall.arguments.skill_name;
      const learningPrompt = buildSkillLearningPrompt(skillName as string, skillContent);
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

  /**
   * It's supposed:
   * If the user asks for an already learned skill
   * it is handled separately in the MANAGER
   * This section is exclusively for the learning skills prompt
   */
  const injectUserResponse = `
    Answer the user request using ONLY the skills detailed in the provided documentation. Do not use external knowledge.

    <user_request>
    ${originalUserRequest}
    </user_request>

    <skills_documentation>
    ${accumulatedContext}
    </skills_documentation>
  `;

  const response = await messageProvider(
    logger,
    injectUserResponse,
    channel,
    options,
    messageHistory
  );

  return normalizeResponse(response);
}

export { learnerWorker };