import { IMemoryService } from "../../../memory-service";
import type { ILogger } from "../../../../infrastructure/logger";
import { getAIProvider } from "../../../providers";
import { AICompletionService, IAICompletionService } from "../../../ai-completion-service";
import { SUMMARIZATION_PROMPT } from "../../../../constants";
import { replacePlaceholders } from "../../../../utils/prompt";
import { beginFooterActivity } from "../../../../utils/footer-activity";
import { parseSummarizerResponse } from "../../../../utils/summarizer-response";
import { ISubAgent } from "../../../../types/agents";
import { config } from "../../../../config";

export interface SummarizerWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  channel: string,
  memoryService: IMemoryService,
}

class Summarizer implements ISubAgent<SummarizerWorkerProps> {
  constructor(
    private readonly logger: ILogger,
    private readonly completionService: IAICompletionService,
  ) { }

  async handler(
    props: SummarizerWorkerProps
  ): Promise<void> {
    const endFooterActivity = beginFooterActivity('summarizer');
    this.logger.info(`Summarizer worker started for session ${props.sessionId} in ${props.channel}`);
    const prompt = replacePlaceholders(SUMMARIZATION_PROMPT, { v1: props.ask, v2: props.answer });

    try {
      const response = await this.completionService.complete(
        { messages: [{ role: "user", content: prompt }] },
        { audit: { sessionId: props.sessionId, channel: props.channel } },
      );
      if (response.kind !== 'message') {
        throw new Error('Summarizer received an unexpected tool-call response');
      }

      const parsedMemory = parseSummarizerResponse(response.text);
      
      let embedding: number[] | undefined;
      if (config.AI.WORKERS.EMBEDDING_ENABLED) {
        try {
          const provider = getAIProvider(this.logger, 'worker');
          embedding = await provider.embed(parsedMemory.content);
        } catch (error) {
          this.logger.error(`Failed to generate embedding for summarized memory`, { error });
        }
      }

      const memory = {
        ...parsedMemory,
        embedding,
      };

      props.memoryService.save(memory);
      this.logger.info(`Summarizer worker completed for session ${props.sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to summarize for session ${props.sessionId}`, { error });
    } finally {
      endFooterActivity();
    }
  }
}

class SummarizerFactory {
  static create(logger: ILogger): Summarizer {
    const completionService = new AICompletionService(getAIProvider(logger, 'worker'), logger, { role: 'worker', agentName: 'summarizer' });
    return new Summarizer(logger, completionService);
  }
}

export { Summarizer, SummarizerFactory };
