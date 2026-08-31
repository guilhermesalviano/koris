import { config } from "../../../../config";
import { DatabaseServiceFactory } from "../../../../infrastructure/db-sqlite";
import { HeartbeatRepositoryFactory, IHeartbeatRepository } from "../../../../repositories/heartbeat";
import { Heartbeat as HeartbeatEntity } from "../../../../entities/heartbeat";
import { isCronDue } from "../../../../utils/heartbeat";
import { IPromptRepository, PromptRepositoryFactory } from "../../../../repositories/prompt";
import { getAIProvider } from "../../../providers";
import { replacePlaceholders } from "../../../../utils/prompt";
import { AICompletionService, IAICompletionService } from "../../../ai-completion-service";
import { HEARTBEAT_INSTRUCTIONS, HEARTBEAT_DATA, SYSTEM_BEAT_CLEAR_IMAGES } from "../../../../constants";
import type { ILogger } from "../../../../infrastructure/logger";
import { IToolsQueue, ToolsQueue } from "../../../tools-queue";
import { ISubAgent } from "../../../../types/agents";
import { AgnosticExecutionToolFactory } from "../../../tools";
import { IChannelsManager } from "../../../../channels";
import { IChannelService, ChannelServiceFactory } from "../../../channel-service";
import { IToolCallPipeline, ToolCallPipelineFactory } from "../../tool-call-pipeline";
import { TaskQueue, sharedSubAgentQueue } from "../../../sub-agents-queue/task-queue";
import { subAgentQueuesRegistry } from "../../../sub-agents-queue/sub-agent-queue-registry";
import { IImageRepository, ImageRepositoryFactory } from "../../../../repositories/image";

class Heartbeat implements ISubAgent<Date> {
  constructor(
    private logger: ILogger,
    private promptRepository: IPromptRepository,
    private heartbeatRepository: IHeartbeatRepository,
    private toolsQueue: IToolsQueue, 
    private channelsManager: IChannelsManager,
    private completionService: IAICompletionService,
    private pipeline: IToolCallPipeline,
    private channelService: IChannelService,
    private imageRepository: IImageRepository,
  ) {
    this.queue = config.AI.SUBAGENTS_PARALLEL ? new TaskQueue(1) : sharedSubAgentQueue;
    subAgentQueuesRegistry.register('heartbeat', this.queue);
  }

  private queue: TaskQueue;

  async handler(date: Date): Promise<void> {
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
      this.queue.add(() => this.executeBeat(beat, date), `heartbeat: ${beat.id}`),
    );

    await Promise.all(promises);
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
        { audit: { channel: 'background', runId: beat.id } },
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
            options: { toolsEnabled: true, runId: beat.id },
            initiatedBy: 'heartbeat',
          },
        );
      }
      this.logger.info(`Heartbeat: Beat "${beat.id}" executed. Result: ${result}`);

      const destination = this.channelService.resolveDelivery(beat);
      if (destination) {
        this.channelsManager.sendMessage(destination.channel, destination.target, result).catch(err => {
          this.logger.error(`Failed to send heartbeat result to ${destination.channel} (${destination.target}) for beat "${beat.id}".`, { err });
        });
      } else {
        this.logger.info(`Heartbeat: No delivery channel recorded for beat "${beat.id}". Result not sent.`);
      }

      this.logger.info(`Heartbeat: Beat "${beat.id}" completed successfully.`);
    } catch (err) {
      this.logger.error(`Heartbeat: Beat "${beat.id}" failed.`, { err });
    }
  }
}

class HeartbeatFactory {
  static create(logger: ILogger, channelsManager: IChannelsManager): Heartbeat {
    const db = DatabaseServiceFactory.create();
    const promptRepository = PromptRepositoryFactory.create(db, logger, getAIProvider(logger, 'embed'));
    const heartbeatRepository = HeartbeatRepositoryFactory.create(db);
    const agnosticExecutionTool = AgnosticExecutionToolFactory.create();
    const toolsQueue = new ToolsQueue(logger, agnosticExecutionTool);

    const completionService = new AICompletionService(() => getAIProvider(logger, 'worker', { background: true }), logger, { role: 'worker', agentName: 'heartbeat' });
    const pipeline = ToolCallPipelineFactory.create(logger);
    const channelService = ChannelServiceFactory.create(db);
    const imageRepository = ImageRepositoryFactory.create(db);
    return new Heartbeat(logger, promptRepository, heartbeatRepository, toolsQueue, channelsManager, completionService, pipeline, channelService, imageRepository);
  }
}

export { Heartbeat, HeartbeatFactory };
