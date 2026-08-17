import { IMemoryService } from "../../../memory-service";
import type { ILogger } from "../../../../infrastructure/logger";
import { getAIProvider } from "../../../providers";
import { AICompletionService, AIServiceError, IAICompletionService } from "../../../ai-completion-service";
import { SUMMARIZATION_INSTRUCTIONS, SUMMARIZATION_DATA } from "../../../../constants";
import { replacePlaceholders } from "../../../../utils/prompt";
import { beginFooterActivity } from "../../../../utils/footer-activity";
import { parseSummarizerResponse } from "../../../../utils/summarizer-response";
import { ISubAgent } from "../../../../types/agents";
import { config } from "../../../../config";
import { TaskQueue, sharedSubAgentQueue } from "../../../sub-agents-queue/task-queue";
import { subAgentQueuesRegistry } from "../../../sub-agents-queue/sub-agent-queue-registry";
import { AuditLogLlm } from "../../../../entities/audit-log";
import { IAuditService, AuditServiceFactory } from "../../../audit/audit-service";
import { generateId } from "../../../../utils/generate-id";
import type { Message } from "../../../../types/messages";

export interface SummarizerWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  channel: string,
  memoryService: IMemoryService,
}

class Summarizer implements ISubAgent<SummarizerWorkerProps> {
  private readonly queue: TaskQueue;

  constructor(
    private readonly logger: ILogger,
    private readonly completionService: IAICompletionService,
    private readonly auditService: IAuditService,
  ) {
    this.queue = config.AI.SUBAGENTS_PARALLEL ? new TaskQueue(1) : sharedSubAgentQueue;
    subAgentQueuesRegistry.register('summarizer', this.queue);
  }

  async handler(
    props: SummarizerWorkerProps
  ): Promise<void> {
    return this.queue.add(() => this.run(props), 'summarizer');
  }

  private async run(props: SummarizerWorkerProps): Promise<void> {
    const endFooterActivity = beginFooterActivity('summarizer');
    this.logger.info(`Summarizer worker started for session ${props.sessionId} in ${props.channel}`);
    const startedAt = Date.now();
    const messages: Message[] = [
      { role: "system", content: SUMMARIZATION_INSTRUCTIONS },
      { role: "user", content: replacePlaceholders(SUMMARIZATION_DATA, { v1: props.ask, v2: props.answer }) },
    ];

    try {
      const response = await this.completionService.complete(
        { messages },
        { audit: { sessionId: props.sessionId, channel: props.channel } },
      );
      if (response.kind !== 'message') {
        this.logger.warn('Summarizer received an unexpected tool-call response; skipping summarization', { sessionId: props.sessionId });
        return;
      }

      const parsedMemory = parseSummarizerResponse(response.text);
      
      let embedding: number[] | undefined;
      if (config.AI.WORKERS.EMBEDDING_ENABLED) {
        try {
          const provider = getAIProvider(this.logger, 'worker', { background: true });
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
      this.recordErrorAudit(props, messages, startedAt, error);
    } finally {
      endFooterActivity();
    }
  }

  private recordErrorAudit(
    props: SummarizerWorkerProps,
    messages: Message[],
    startedAt: number,
    error: unknown,
  ): void {
    const prompt = JSON.stringify(messages);
    const entry: AuditLogLlm = {
      id: generateId(),
      type: 'llm',
      role: 'worker',
      agentName: 'summarizer',
      sessionId: props.sessionId,
      channel: props.channel,
      provider: config.AI.WORKERS.PROVIDER,
      model: config.AI.WORKERS.MODEL,
      prompt,
      promptLength: prompt.length,
      toolCalls: 0,
      durationMs: Date.now() - startedAt,
      status: 'error',
      errorCode: error instanceof AIServiceError ? error.code : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      createdAt: new Date(),
    };
    this.auditService.record(entry);
  }
}

class SummarizerFactory {
  static create(logger: ILogger): Summarizer {
    const completionService = new AICompletionService(getAIProvider(logger, 'worker', { background: true }), logger, { role: 'worker', agentName: 'summarizer' });
    return new Summarizer(logger, completionService, AuditServiceFactory.create(logger));
  }
}

export { Summarizer, SummarizerFactory };
