import { IMemoryService } from "../../memory-service";
import type { ILogger } from "../../../infrastructure/logger";
import { getAIProvider } from "../../providers";
import { MemoryType } from "../../../types/memory";
import { SUMMARIZATION_PROMPT } from "../../../constants";
import { replacePlaceholders } from "../../../utils/prompt";

interface SummarizerWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  type: MemoryType,
  logger: ILogger,
  channel: string,
  memoryService: IMemoryService,
}

async function summarizerWorker(
  props: SummarizerWorkerProps
): Promise<void> {
  props.logger.info(`Summarizer worker started for session ${props.sessionId} in ${props.channel}`);
  const provider = getAIProvider({ logger: props.logger });

  const prompt = replacePlaceholders(SUMMARIZATION_PROMPT, { v1: props.ask, v2: props.answer });

  try {
    const content = await provider
      .chat({ messages: [{ role: "user", content: prompt }] });

    const memory = {
      type: props.type,
      content,
    };

    props.memoryService.upsert(memory);
    props.logger.info(`Summarizer worker completed for session ${props.sessionId}`);
  } catch (error) {
    props.logger.error(`Failed to summarize for session ${props.sessionId}`, { error });
  }
}

export { summarizerWorker };
