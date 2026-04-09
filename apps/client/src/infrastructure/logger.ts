import {
  Logger as WinstonLogger, createLogger, format, LoggerOptions, transports,
} from 'winston';
import { config } from '../config';

interface ILogger {
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

class Logger implements ILogger {
  logger: WinstonLogger;

  constructor(logger: WinstonLogger) {
    this.logger = logger;
  }

  log(level: string, message: string) {
    return this.logger.log(level, message);
  }
}

class LoggerFactory {
  static getOptions() {
    const generateExtraTags = format((info) => {
      const newInfo = info;
      newInfo['created_at'] = new Date().toISOString();
      return newInfo;
    });

    const options: LoggerOptions = {
      level: config.LOG_LEVEL || 'info',
      format: format.combine(generateExtraTags(), format.json()),
      defaultMeta: {
        environment: config.ENVIRONMENT,
      },
      transports: [new transports.Console()],
    };

    return options
  }

  static create(): ILogger {
    const logger = createLogger(LoggerFactory.getOptions());
    return new Logger(logger);
  }
}

export { ILogger, LoggerFactory };