import type { CommandResult } from "../../types/commands";
import { PLAN_PROMPT } from "../../constants";
import { replacePlaceholders } from "../../utils/prompt";
import { getAIProvider } from "../providers";
import { AIChatRequest } from "../../types/chat";
import { ProcessOptions } from "../../types/agents";
import { ILogger } from "../../infrastructure/logger";
import { AICompletionService } from "../ai-completion-service";

async function handlePlan(message: string, logger: ILogger, options?: ProcessOptions): Promise<CommandResult> {
  const prompt = replacePlaceholders(PLAN_PROMPT, { v1: message });

  const provider = getAIProvider(logger);
  const completionService = new AICompletionService(provider, logger, { role: 'manager', agentName: 'plan' });
  const chatRequest: AIChatRequest = {
    messages: [{ role: 'user', content: prompt }], 
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