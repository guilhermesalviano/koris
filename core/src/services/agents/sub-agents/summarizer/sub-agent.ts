import { IMemoryService } from "../../../memory-service";
import type { ILogger } from "../../../../infrastructure/logger";
import { getAIProvider } from "../../../providers";
import { AIServiceError, IAICompletionService } from "../../../ai-completion-service";
import { SUMMARIZATION_INSTRUCTIONS, SUMMARIZATION_DATA, COMPACT_INSTRUCTIONS, COMPACT_DATA } from "../../../../constants";
import { replacePlaceholders } from "../../../../utils/prompt";
import { beginFooterActivity } from "../../../../utils/footer-activity";
import { parseSummarizerResponse } from "../../../../utils/summarizer-response";
import { config } from "../../../../config";
import { TaskQueue } from "../queue/task-queue";
import { AuditLogLlm } from "../../../../entities/audit-log";
import { IAuditService } from "../../../audit/audit-service";
import { generateId } from "../../../../utils/generate-id";
import type { Message } from "../../../../types/messages";
import type { Message as MessageEntity } from "../../../../entities/message";
import type { MemoryType } from "../../../../types/memory";
import type { SubAgentDescriptor } from "../contracts";
import { SUMMARIZER } from "./key";

export interface SummarizerWorkerProps {
  sessionId: string,
  ask: string,
  answer: string,
  channel: string,
  memoryService: IMemoryService,
}

export interface CompactWorkerProps {
  sessionId: string,
  messages: MessageEntity[],
  channel: string,
  memoryService: IMemoryService,
}

export interface CompactResult {
  type: MemoryType,
  content: string,
}

class Summarizer {
  constructor(
    private readonly logger: ILogger,
    private readonly completionService: IAICompletionService,
    private readonly auditService: IAuditService,
    private readonly queue: TaskQueue = new TaskQueue(1),
    private readonly descriptor: SubAgentDescriptor = SUMMARIZER,
  ) {}

  async summarize(props: SummarizerWorkerProps): Promise<void> {
    return this.queue.add(() => this.run(props), this.descriptor.id);
  }

  async compact(props: CompactWorkerProps): Promise<CompactResult> {
    return this.queue.add(() => this.runCompact(props), `${this.descriptor.id}-compact`);
  }

  private async run(props: SummarizerWorkerProps): Promise<void> {
    const endFooterActivity = beginFooterActivity(this.descriptor.id);
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

      await this.saveMemory(props.memoryService, parseSummarizerResponse(response.text), '');
      this.logger.info(`Summarizer worker completed for session ${props.sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to summarize for session ${props.sessionId}`, { error });
      this.recordErrorAudit(props, messages, startedAt, error);
    } finally {
      endFooterActivity();
    }
  }

  private async runCompact(props: CompactWorkerProps): Promise<CompactResult> {
    const endFooterActivity = beginFooterActivity(this.descriptor.id);
    this.logger.info(`Compacting session ${props.sessionId} in ${props.channel}`);
    const startedAt = Date.now();
    const transcript = this.formatTranscript(props.messages);
    const messages: Message[] = [
      { role: "system", content: COMPACT_INSTRUCTIONS },
      { role: "user", content: replacePlaceholders(COMPACT_DATA, { v1: transcript }) },
    ];

    try {
      const response = await this.completionService.complete(
        { messages },
        { audit: { sessionId: props.sessionId, channel: props.channel } },
      );
      if (response.kind !== 'message') {
        throw new Error('Compaction received an unexpected tool-call response');
      }

      const parsedMemory = parseSummarizerResponse(response.text);
      await this.saveMemory(props.memoryService, parsedMemory, ' while compacting');
      this.logger.info(`Compaction completed for session ${props.sessionId}`);
      return parsedMemory;
    } catch (error) {
      this.logger.error(`Failed to compact session ${props.sessionId}`, { error });
      this.recordErrorAudit({ sessionId: props.sessionId, channel: props.channel }, messages, startedAt, error);
      throw error;
    } finally {
      endFooterActivity();
    }
  }

  private async saveMemory(memoryService: IMemoryService, memory: CompactResult, context: string): Promise<void> {
    let embedding: number[] | undefined;
    if (config.AI.EMBED.ENABLED) {
      try {
        const provider = getAIProvider(this.logger, 'embed', { background: true });
        embedding = await provider.embed(memory.content);
      } catch (error) {
        this.logger.error(
          `embed failed for ${config.AI.EMBED.PROVIDER}/${config.AI.EMBED.MODEL}${context}; memory saved WITHOUT an embedding and will not surface in semantic memory — check the embed provider/model is reachable`,
          { error },
        );
      }
    }

    memoryService.save({ ...memory, embedding });
  }

  private formatTranscript(messages: MessageEntity[]): string {
    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const TRANSCRIPT_LIMIT = 20000;
    return transcript.length > TRANSCRIPT_LIMIT ? transcript.slice(-TRANSCRIPT_LIMIT) : transcript;
  }

  private recordErrorAudit(
    props: Pick<SummarizerWorkerProps, 'sessionId' | 'channel'>,
    messages: Message[],
    startedAt: number,
    error: unknown,
  ): void {
    const prompt = JSON.stringify(messages);
    const profile = this.descriptor.role === 'worker' ? config.AI.WORKERS : config.AI.MANAGER;
    const entry: AuditLogLlm = {
      id: generateId(),
      type: 'llm',
      role: this.descriptor.role,
      agentName: this.descriptor.id,
      sessionId: props.sessionId,
      channel: props.channel,
      provider: profile.PROVIDER,
      model: profile.MODEL,
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

export { Summarizer };
