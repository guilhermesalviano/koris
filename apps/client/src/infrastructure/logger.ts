import {
  Logger as WinstonLogger, createLogger, format, LoggerOptions, transports,
} from 'winston';
import path from 'path';
import { config } from '../config';

interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

class Logger implements ILogger {
  logger: WinstonLogger;

  constructor(logger: WinstonLogger) {
    this.logger = logger;
  }

  info(message: string, meta?: Record<string, unknown>) {
    return this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    return this.logger.error(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    return this.logger.debug(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    return this.logger.warn(message, meta);
  }
}

class LoggerFactory {
  static getOptions() {
    const generateExtraTags = format((info) => {
      const newInfo = info;
      newInfo['created_at'] = new Date().toISOString();
      return newInfo;
    });

    // Create logs directory if it doesn't exist
    const logsDir = path.join(config.BASE_DIR, 'logs');

    const options: LoggerOptions = {
      level: config.LOG_LEVEL || 'info',
      format: format.combine(generateExtraTags(), format.json()),
      defaultMeta: {
        environment: config.ENVIRONMENT,
      },
      transports: [
        new transports.Console(),
        new transports.File({ 
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new transports.File({ 
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    };

    return options
  }

  static create(): ILogger {
    const logger = createLogger(LoggerFactory.getOptions());
    return new Logger(logger);
  }
}

export { ILogger, LoggerFactory };