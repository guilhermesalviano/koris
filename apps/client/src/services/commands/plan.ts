import type { CommandResult } from "../../types/commands";
import { PLAN_PROMPT } from "../../constants";
import { replacePlaceholders } from "../../utils/prompt";
import { getAIProvider } from "../providers";
import { AIChatRequest } from "../../types/provider";
import { ProcessOptions } from "../../types/agents";
import { ILogger } from "../../infrastructure/logger";

async function handlePlan(message: string, logger: ILogger, options?: ProcessOptions): Promise<CommandResult> {
  const prompt = replacePlaceholders(PLAN_PROMPT, { v1: message });

  const provider = getAIProvider(logger);
  const chatRequest: AIChatRequest = {
    messages: [{ role: 'user', content: prompt }], 
    ...options?.toolsEnabled ? { tools: [] } : {} 
  };
  const content = await provider.chat(chatRequest, { signal: options?.signal });

  logger.info(`Plan generated: "${content}"`);

  return {
    response: content,
    action: 'none',
    handled: true,
  };
}

export { handlePlan };