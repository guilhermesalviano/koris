import { IHeartbeatRepository } from "../../../../repositories/heartbeat";
import { Heartbeat as HeartbeatEntity } from "../../../../entities/heartbeat";
import { isCronDue } from "../../../../utils/heartbeat";
import { IPromptRepository } from "../../../../repositories/prompt";
import { replacePlaceholders } from "../../../../utils/prompt";
import { IAICompletionService } from "../../../ai-completion-service";
import { HEARTBEAT_INSTRUCTIONS, HEARTBEAT_DATA, SYSTEM_BEAT_CLEAR_IMAGES } from "../../../../constants";
import type { ILogger } from "../../../../infrastructure/logger";
import { IToolsQueue } from "../../../tools-queue";
import { IToolCallPipeline } from "../../tool-call-pipeline";
import { TaskQueue } from "../queue/task-queue";
import { IImageRepository } from "../../../../repositories/image";
import { BeatRun, IBeatRunRepository } from "../../../../repositories/beat-run";
import { generateId } from "../../../../utils/generate-id";
import type { SubAgentDescriptor } from "../contracts";
import { HEARTBEAT } from "./key";

class Heartbeat {
  constructor(
    private logger: ILogger,
    private promptRepository: IPromptRepository,
    private heartbeatRepository: IHeartbeatRepository,
    private toolsQueue: IToolsQueue,
    private completionService: IAICompletionService,
    private pipeline: IToolCallPipeline,
    private imageRepository: IImageRepository,
    private beatRunRepository: IBeatRunRepository,
    private queue: TaskQueue = new TaskQueue(1),
    private descriptor: SubAgentDescriptor = HEARTBEAT,
  ) {}

  async run(date: Date): Promise<void> {
    const beats = this.heartbeatRepository.getAll();

    this.logger.info('Heartbeat: Agent is alive and functioning.');


    if (beats.length === 0) {
      this.logger.info('Heartbeat: No scheduled beats found.');
      return;
    }

    const dueBeats = beats.filter((beat) => {
      const since = beat.lastRun ?? beat.createdAt ?? new Date(0);

      if (!isCronDue(beat.cronExpression, date, since)) {
        this.logger.info(`Heartbeat: Beat "${beat.id}" not due yet (cron: ${beat.cronExpression}).`);
        return false;
      }

      return true;
    });

    if (dueBeats.length === 0) {
      return;
    }

    const promises = dueBeats.map((beat) =>
      this.queue.add(() => this.runBeat(beat, date), `${this.descriptor.id}: ${beat.id}`),
    );

    await Promise.all(promises);
  }

  private async runBeat(beat: HeartbeatEntity, date: Date): Promise<void> {
    try {
      await this.executeBeat(beat, date);
    } finally {
      // A one-time beat pins a date without a year, so it would match again next year.
      if (beat.runOnce) {
        this.heartbeatRepository.deleteById(beat.id);
        this.logger.info(`Heartbeat: One-time beat "${beat.id}" fired and was removed.`);
      }
    }
  }

  private async executeBeat(beat: HeartbeatEntity, date: Date): Promise<void> {
    this.logger.info(`Heartbeat: Executing beat "${beat.id}" — ${beat.beat}`);
    this.heartbeatRepository.updateLastRun(beat.id, date);

    if (beat.beat === SYSTEM_BEAT_CLEAR_IMAGES) {
      const deleted = this.imageRepository.deleteAll();
      this.logger.info(`Heartbeat: System beat "${beat.id}" cleared ${deleted} image(s) from the images table.`);
      return;
    }

    const instructions = replacePlaceholders(HEARTBEAT_INSTRUCTIONS, { v1: `${beat.type}` });
    const data = replacePlaceholders(HEARTBEAT_DATA, { v2: `beat: ${beat.beat}` });
    // Each run gets its own id so its audited LLM and tool calls can be told
    // apart from the same beat's earlier runs.
    const runId = generateId();
    const startedAt = new Date();

    try {
      const payload = await this.promptRepository
        .build({
          userMessage: data,
          channel: 'background',
          toolsEnabled: true,
          messageHistory: [],
          includeBeatTools: false,
          extraSystemBlocks: [instructions],
        });

      const response = await this.completionService.complete(
        payload,
        { audit: { channel: 'background', runId } },
      );
      let result: string;
      if (response.kind === 'message') {
        result = response.text;
      } else {
        result = await this.pipeline.execute(
          response.calls,
          beat.beat,
          [],
          {
            channel: 'background',
            toolsQueue: this.toolsQueue,
            signal: new AbortController().signal,
            onProgress: (progress: string) => this.logger.info(progress),
            options: { toolsEnabled: true, runId },
            initiatedBy: this.descriptor.id,
          },
        );
      }
      this.logger.info(`Heartbeat: Beat "${beat.id}" executed. Result: ${result}`);
      // Results are only stored for the Watcher chat; beats no longer message a channel.
      this.recordRun({ id: runId, beat, startedAt, status: 'success', result });

      this.logger.info(`Heartbeat: Beat "${beat.id}" completed successfully.`);
    } catch (err) {
      this.logger.error(`Heartbeat: Beat "${beat.id}" failed.`, { err });
      this.recordRun({ id: runId, beat, startedAt, status: 'error', errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }

  private recordRun(input: {
    id: string;
    beat: HeartbeatEntity;
    startedAt: Date;
    status: BeatRun['status'];
    result?: string;
    errorMessage?: string;
  }): void {
    try {
      this.beatRunRepository.save({
        id: input.id,
        beatId: input.beat.id,
        beat: input.beat.beat,
        beatType: input.beat.type,
        status: input.status,
        result: input.result,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        finishedAt: new Date(),
      });
    } catch (err) {
      this.logger.error(`Heartbeat: Could not record the run of beat "${input.beat.id}".`, { err });
    }
  }
}

export { Heartbeat };
