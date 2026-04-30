import { config } from "../../config";
import { ILogger } from "../../infrastructure/logger";
import { DatabaseServiceFactory } from "../../infrastructure/db-sqlite";
import { HeartbeatRepositoryFactory } from "../../repositories/heartbeat";
import { isCronDue } from "../../utils/heartbeat";
import { messageProvider } from "../agents/chat/message-provider";

interface HeartbeatProps {
  logger: ILogger;
  date: Date;
}

async function heartbeat(props: HeartbeatProps) {
  const { logger, date } = props;

  const [ start, end ] = activeHoursHelper();

  if (date < start || date > end) {
    logger.info(`Heartbeat skipped: Current time (${date.toLocaleTimeString()}) is outside of active hours (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}).`);
    return;
  }
  logger.info('Heartbeat: Agent is alive and functioning.');

  const repo = HeartbeatRepositoryFactory.create(DatabaseServiceFactory.create());
  const tasks = repo.getAll();

  if (tasks.length === 0) {
    logger.info('Heartbeat: No scheduled tasks found.');
    return;
  }

  for (const task of tasks) {
    const since = task.lastRun ?? new Date(date.getTime() - config.HEARTBEAT.INTERVAL_MS);

    if (!isCronDue(task.cronExpression, date, since)) {
      logger.info(`Heartbeat: Task "${task.id}" not due yet (cron: ${task.cronExpression}).`);
      continue;
    }

    logger.info(`Heartbeat: Executing task "${task.id}" — ${task.task}`);

    try {
      // refactor - usar um novo tipo de manager para heartbeat tasks, que não precisa de message history, channel, etc. Talvez só passar o texto da task e um contexto com logger.
      const result = await messageProvider(logger, task.task, "tui", { toolsEnabled: true }, []);

      // response can be a reminder in Telegram, summarization of my Emails, a document of estudy from something(create a file to it.) 
      logger.info(`Heartbeat results: ${result}`);

      repo.updateLastRun(task.id, date);
      logger.info(`Heartbeat: Task "${task.id}" completed successfully.`);
    } catch (err) {
      logger.error(`Heartbeat: Task "${task.id}" failed.`, { err });
    }
  }
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

export { heartbeat };