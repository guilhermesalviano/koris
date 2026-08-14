import { config } from "../../../../config";
import { DatabaseServiceFactory } from "../../../../infrastructure/db-sqlite";
import { HeartbeatRepositoryFactory, IHeartbeatRepository } from "../../../../repositories/heartbeat";
import { Heartbeat as HeartbeatEntity } from "../../../../entities/heartbeat";
import { isCronDue } from "../../../../utils/heartbeat";
import { IPromptRepository, PromptRepositoryFactory } from "../../../../repositories/prompt";
import { getAIProvider } from "../../../providers";
import { replacePlaceholders } from "../../../../utils/prompt";
import { AICompletionService, IAICompletionService } from "../../../ai-completion-service";
import { HEARTBEAT_PROMPT } from "../../../../constants";
import type { ILogger } from "../../../../infrastructure/logger";
import { IToolsQueue, ToolsQueue } from "../../../tools-queue";
import { ExecutorWorkerFactory } from "../../../workers/executor-worker";
import { ISubAgent } from "../../../../types/agents";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { AgnosticExecutionToolFactory } from "../../../tools";
import { IChannelsManager } from "../../../../channels";
import { getLastWhitelistedJid } from "../../../../../plugins/whatsapp";
import type { IWorker } from "../../../../types/workers";
import { TaskQueue, sharedSubAgentQueue } from "../../../../utils/task-queue";
import { subAgentQueuesRegistry } from "../../../../utils/sub-agent-queue-registry";

class Heartbeat implements ISubAgent<Date> {
  constructor(
    private logger: ILogger,
    private promptRepository: IPromptRepository,
    private heartbeatRepository: IHeartbeatRepository,
    private toolsQueue: IToolsQueue, 
    private channelsManager: IChannelsManager,
    private completionService: IAICompletionService,
    private executorWorker: IWorker,
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
      this.queue.add(() => this.executeBeat(beat, date)),
    );

    await Promise.all(promises);
  }

  private async executeBeat(beat: HeartbeatEntity, date: Date): Promise<void> {
    this.logger.info(`Heartbeat: Executing beat "${beat.id}" — ${beat.beat}`);
    this.heartbeatRepository.updateLastRun(beat.id, date);

    const prompt = replacePlaceholders(HEARTBEAT_PROMPT, { v1: `${beat.type}`, v2: `beat: ${beat.beat}` });

    try {
      // refactor - usar um novo tipo de manager para heartbeat beats, que não precisa de message history, channel, etc. Talvez só passar o texto do beat e um contexto com logger.
      const payload = await this.promptRepository
        .build({
          userMessage: prompt,
          channel: 'background',
          toolsEnabled: true,
          messageHistory: [],
          includeBeatTools: false
        });

      // this.logger.debug(`heartbeat prompt value ${JSON.stringify(payload)}`);
    
      const response = await this.completionService.complete(
        payload,
        { audit: { channel: 'background', runId: beat.id } },
      );
      let result: string;
      if (response.kind === 'message') {
        result = response.text;
      } else {
        result = await this.executorWorker.run({
          toolCalls: response.calls,
          userMessage: beat.beat,
          messageHistory: [],
          ctx: {
            channel: 'background',
            toolsQueue: this.toolsQueue,
            signal: new AbortController().signal,
            onProgress: (progress: string) => this.logger.info(progress),
            options: { toolsEnabled: true, runId: beat.id },
          },
        });
      }
      this.saveBeatResult({ beatId: beat.id, date, result });

      this.logger.info(`Heartbeat: Beat "${beat.id}" executed. Result: ${result}`);

      // Hardcoded for tests
      if (config.CHANNELS.TELEGRAM.ENABLED) {
        this.channelsManager.sendMessage('telegram', config.CHANNELS.TELEGRAM.CHAT_ID, result).catch(err => {
          this.logger.error(`Failed to send heartbeat result to Telegram for beat "${beat.id}".`, { err });
        });
      }

      if (config.CHANNELS.WHATSAPP.ENABLED) {
        const whatsappTarget = getLastWhitelistedJid() ?? config.CHANNELS.WHATSAPP.TARGET_JID;
        if (whatsappTarget) {
          this.channelsManager.sendMessage('whatsapp', whatsappTarget, result).catch(err => {
            this.logger.error(`Failed to send heartbeat result to WhatsApp for beat "${beat.id}".`, { err });
          });
        }
      }

      this.logger.info(`Heartbeat: Beat "${beat.id}" completed successfully.`);
    } catch (err) {
      this.logger.error(`Heartbeat: Beat "${beat.id}" failed.`, { err });
    }
  }


  formatDateStamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(date.getDate())}_${pad(date.getHours())}_${pad(date.getMinutes())}`;
  }

  saveBeatResult(props: { beatId: string; date: Date; result: string }): void {
    const { beatId, date, result } = props;
    const tempDir = resolve(config.BASE_DIR, config.TEMP_FOLDER);
    const filename = `${beatId}_${this.formatDateStamp(date)}.md`;
    const filePath = join(tempDir, filename);

    try {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(filePath, result, 'utf-8');
      this.logger.info(`Heartbeat: Beat result saved to ${filePath}`);
    } catch (err) {
      this.logger.error(`Heartbeat: Failed to save beat result to ${filePath}`, { err });
    }
  }
}

class HeartbeatFactory {
  static create(logger: ILogger, channelsManager: IChannelsManager): Heartbeat {
    const db = DatabaseServiceFactory.create();
    const aiProvider = getAIProvider(logger, 'worker', { background: true });
    const promptRepository = PromptRepositoryFactory.create(db, logger, aiProvider);
    const heartbeatRepository = HeartbeatRepositoryFactory.create(db);
    const agnosticExecutionTool = AgnosticExecutionToolFactory.create();
    const toolsQueue = new ToolsQueue(logger, agnosticExecutionTool);

    const completionService = new AICompletionService(aiProvider, logger, { role: 'worker', agentName: 'heartbeat' });
    const executorWorker = ExecutorWorkerFactory.create(logger);
    return new Heartbeat(logger, promptRepository, heartbeatRepository, toolsQueue, channelsManager, completionService, executorWorker);
  }
}

export { Heartbeat, HeartbeatFactory };
