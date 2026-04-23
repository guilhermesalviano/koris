import { IMemoryService, SaveMemoryProps } from "../../memory-service";
import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions } from "../../../types/agents";
import { getAIProvider } from "../../providers";
import { MemoryType } from "../../../types/memory";
import { SUMMARIZATION_PROMPT } from "../../../constants";

async function summarizerWorker(
  sessionId: string,
  ask: string,
  answer: string,
  type: MemoryType,
  logger: ILogger,
  channel: string,
  memoryService: IMemoryService,
  _options?: ProcessOptions
): Promise<void> {
  logger.info(`Summarizer worker started for session ${sessionId} in ${channel}`);
  const provider = getAIProvider({ logger });

  const prompt = `${SUMMARIZATION_PROMPT}
### DATA TO SUMMARIZE:
User: ${ask}
Assistant: ${answer}
`;

  try {
    const content = await provider
      .chat({ messages: [{ role: "user", content: prompt }] });

    const memory: SaveMemoryProps = {
      type,
      content,
    };

    memoryService.upsert(memory);
    logger.info(`Summarizer worker completed for session ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to summarize for session ${sessionId}`, { error });
  }
}

export { summarizerWorker };
