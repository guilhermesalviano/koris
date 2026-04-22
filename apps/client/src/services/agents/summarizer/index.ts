import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { normalizeResponse } from "../../../utils/tool-calls";
import { MemoryServiceFactory, SaveMemoryProps } from "../../memory-service";
import { messageProvider } from "../chat/message-provider";
import type { ILogger } from "../../../infrastructure/logger";
import type { ProcessOptions } from "../../../types/agents";

const SUMMARIZATION_PROMPT = `Extract the most important information to remember from this interaction in 1–3 concise sentences.
Focus on user preferences, facts, decisions, and key takeaways.

Answer with only the sentences. No explanations or additional text.`;

async function summarizerWorker(
  sessionId: string,
  ask: string,
  answer: string,
  logger: ILogger,
  channel: string,
  options?: ProcessOptions
): Promise<void> {
  logger.info(`Summarizer worker started for session ${sessionId}`);

  const prompt = `${SUMMARIZATION_PROMPT}\n\nConversation:\nUser: ${ask}\nAssistant: ${answer}`;

  try {
    const contentSummarized = await messageProvider(
      logger,
      prompt,
      channel,
      options,
      []
    );

    const memory: SaveMemoryProps = {
      type: "summary",
      content: normalizeResponse(contentSummarized),
    };

    const db = DatabaseServiceFactory.create();
    const memoryService = MemoryServiceFactory.create(db);
    memoryService.save(sessionId, memory);

    logger.info(`Summarizer worker completed for session ${sessionId}`);
  } catch (error) {
    logger.error(`Failed to summarize for session ${sessionId}`, { error });
  }
}

export { summarizerWorker };
