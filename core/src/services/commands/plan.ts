import type { CommandResult } from "../../types/commands";
import { PLAN_INSTRUCTIONS, PLAN_DATA } from "../../constants";
import { replacePlaceholders } from "../../utils/prompt";
import { getAIProvider } from "../providers";
import { AIChatRequest } from "../../types/chat";
import { ProcessOptions } from "../../types/agents";
import { ILogger } from "../../infrastructure/logger";
import { AICompletionService } from "../ai-completion-service";

async function handlePlan(message: string, logger: ILogger, options?: ProcessOptions): Promise<CommandResult> {
  const data = replacePlaceholders(PLAN_DATA, { v1: message });

  const completionService = new AICompletionService(() => getAIProvider(logger), logger, { role: 'manager', agentName: 'plan' });
  const chatRequest: AIChatRequest = {
    messages: [{ role: 'system', content: PLAN_INSTRUCTIONS }, { role: 'user', content: data }],
    ...options?.toolsEnabled ? { tools: [] } : {} 
  };
  const response = await completionService.complete(chatRequest, { signal: options?.signal });
  const content = response.kind === 'message' ? response.text : JSON.stringify(response.calls);

  logger.info(`Plan generated: "${content}"`);

  return {
    response: content,
    action: 'none',
    handled: true,
  };
}

export { handlePlan };