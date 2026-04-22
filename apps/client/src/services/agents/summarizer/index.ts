import { normalizeResponse } from "../../../utils/tool-calls";
import { IMemoryService, SaveMemoryProps } from "../../memory-service";
import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions } from "../../../types/agents";
import { getAIProvider } from "../../providers";
import { MemoryType } from "../../../types/memory";

const SUMMARIZATION_PROMPT = `
Task: Provide a concise 1-3 sentence summary of the topic in messages.
Constraints:
- Prioritize specific facts, figures, dates, and actionable decisions.
- Do not include introductory phrases (e.g., "The conversation was about...").
- Output ONLY the summary text.

Formatting Rule: Strict brevity required.`;

async function summarizerWorker(
  sessionId: string,
  ask: string,
  answer: string,
  type: MemoryType,
  logger: ILogger,
  channel: string,
  memoryService: IMemoryService,
  options?: ProcessOptions
): Promise<void> {
  logger.info(`Summarizer worker started for session ${sessionId} in ${channel}`);
  const provider = getAIProvider({ logger });

  const prompt = `${SUMMARIZATION_PROMPT}\n\\nUser: ${ask}\nAssistant: ${answer}`;

  try {
    const contentSummarized = await provider.chat({
        messages: [{ role: "user", content: prompt }] 
      }, { signal: options?.signal });

    const memory: SaveMemoryProps = {
      type: type,
      content: normalizeResponse(contentSummarized),
    };

    memoryService.upsert(memory);
    logger.info(`Summarizer worker completed for session ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to summarize for session ${sessionId}`, { error });
  }
}

export { summarizerWorker };
