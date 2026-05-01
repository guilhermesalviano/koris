import { config } from "../../../config";
import { DatabaseServiceFactory } from "../../../infrastructure/db-sqlite";
import { HeartbeatRepositoryFactory } from "../../../repositories/heartbeat";
import { isCronDue } from "../../../utils/heartbeat";
import { PromptRepositoryFactory } from "../../../repositories/prompt";
import { getAIProvider } from "../../providers";
import { SkillsRepository } from "../../../repositories/skills";
import { replacePlaceholders } from "../../../utils/prompt";
import { HEARTBEAT_PROMPT } from "../../../constants";
import type { ILogger } from "../../../infrastructure/logger";
import { extractToolCalls, normalizeResponse } from "../../../utils/tool-calls";
import { executorWorker } from "../../workers/executor-worker";
import { MessageServiceFactory } from "../../message-service";
import { SessionServiceFactory } from "../../session-service";
import { ToolsQueue } from "../../tools-queue";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

interface HeartbeatProps {
  logger: ILogger;
  date: Date;
}

async function heartbeat(props: HeartbeatProps) {
  const { logger, date } = props;
  const provider = getAIProvider({ logger });

  const db = DatabaseServiceFactory.create();
  const promptRepository = PromptRepositoryFactory.create(db);
  const repo = HeartbeatRepositoryFactory.create(db);
  const sessionService = SessionServiceFactory.create(db, 'tui');
  const messageService = MessageServiceFactory.create(db, sessionService);
  const toolsQueue = new ToolsQueue(logger);
  const tasks = repo.getAll();
  const skillsRepository = new SkillsRepository(logger);
  const skills = skillsRepository.get();

  const [ start, end ] = activeHoursHelper();

  if (date < start || date > end) {
    logger.info(`Heartbeat skipped: Current time (${date.toLocaleTimeString()}) is outside of active hours (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}).`);
    return;
  }
  logger.info('Heartbeat: Agent is alive and functioning.');


  if (tasks.length === 0) {
    logger.info('Heartbeat: No scheduled tasks found.');
    return;
  }

  // if dont have task, keep necessity to execute AI 
  for (const task of tasks) {
    const since = task.lastRun ?? new Date(date.getTime() - config.HEARTBEAT.INTERVAL_MS);

    if (!isCronDue(task.cronExpression, date, since)) {
      logger.info(`Heartbeat: Task "${task.id}" not due yet (cron: ${task.cronExpression}).`);
      continue;
    }

    logger.info(`Heartbeat: Executing task "${task.id}" — ${task.task}`);
    const prompt = replacePlaceholders(HEARTBEAT_PROMPT, { v1: `task: ${task.task} and type: ${task.type}` });

    try {
      // refactor - usar um novo tipo de manager para heartbeat tasks, que não precisa de message history, channel, etc. Talvez só passar o texto da task e um contexto com logger.
      const payload = promptRepository.build({ 
        userMessage: prompt, 
        channel: 'tui', 
        skills, 
        toolsEnabled: true,
        messageHistory: []
      });

      logger.debug(`heartbeat prompt value ${JSON.stringify(payload)}`);
    
      const result = await provider.chat(payload);

      let executorResult = '';
      if (!isAsyncGen(result)) {
        const responseText = normalizeResponse(result);
        const toExecute = extractToolCalls(responseText);

        if (toExecute.length === 0) {
          executorResult = responseText;
        } else {
          const executed = await executorWorker(
            toExecute,
            task.task,
            [],
            {
              logger,
              channel: 'tui',
              message: messageService,
              toolsQueue,
              signal: new AbortController().signal,
              onProgress: (progress) => logger.info(progress),
              options: { toolsEnabled: true },
            },
          );
          executorResult = await toText(executed);
        }
      }

      saveTaskResult({ taskId: task.id, date, result: executorResult || result, logger });

      // response can be a reminder in Telegram, summarization of my Emails, a document of estudy from something(create a file to keep it in temp) 
      logger.info(`Heartbeat results: ${executorResult || result}`);

      repo.updateLastRun(task.id, date);
      logger.info(`Heartbeat: Task "${task.id}" completed successfully.`);
    } catch (err) {
      logger.error(`Heartbeat: Task "${task.id}" failed.`, { err });
    }
  }
}

function isAsyncGen(val: unknown): val is AsyncGenerator<string> {
  return typeof val === 'object' && val !== null && Symbol.asyncIterator in val;
}

async function toText(value: string | AsyncGenerator<string>): Promise<string> {
  if (typeof value === 'string') {
    return value;
  }

  let fullText = '';
  for await (const chunk of value) {
    fullText += chunk;
  }

  return fullText;
}

function activeHoursHelper(): Date[] {
  const start = new Date();
  const [startHour, startMinute] = config.HEARTBEAT.ACTIVE_HOURS.START.split(':').map(Number);
  start.setHours(startHour, startMinute, 0, 0);

  const end = new Date();
  const [endHour, endMinute] = config.HEARTBEAT.ACTIVE_HOURS.END.split(':').map(Number);
  end.setHours(endHour, endMinute, 0, 0);

  return [start, end];
}

function formatDateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(date.getDate())}_${pad(date.getHours())}_${pad(date.getMinutes())}`;
}

function saveTaskResult(props: { taskId: string; date: Date; result: string; logger: ILogger }): void {
  const { taskId, date, result, logger } = props;
  const tempDir = resolve(config.BASE_DIR, config.TEMP_FOLDER);
  const filename = `${taskId}_${formatDateStamp(date)}.md`;
  const filePath = join(tempDir, filename);

  try {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(filePath, result, 'utf-8');
    logger.info(`Heartbeat: Task result saved to ${filePath}`);
  } catch (err) {
    logger.error(`Heartbeat: Failed to save task result to ${filePath}`, { err });
  }
}

export { heartbeat };