import { config } from "../../config";
import { ILogger } from "../../infrastructure/logger";

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