import {
  Logger as WinstonLogger, createLogger, format, LoggerOptions, transports,
} from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { sanitizeLogText, sanitizeMeta } from '../utils/sanitize-log-text';

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

  private log(level: 'info' | 'error' | 'debug' | 'warn', message: string, meta?: Record<string, unknown>) {
    const safeMessage = sanitizeLogText(message);
    const safeMeta = sanitizeMeta(meta);
    return this.logger.log(level, safeMessage, safeMeta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    return this.log('info', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    return this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    return this.log('debug', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    return this.log('warn', message, meta);
  }
}

class LoggerFactory {
  static getOptions() {
    const logsDir = path.join(config.BASE_DIR, 'logs');

    const activeTransports: any[] = [
      new transports.Console()
    ];

    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      activeTransports.push(
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
        })
      );
    } catch (error) {
      console.warn(`[LoggerFactory] Warning: Could not create log directory at ${logsDir}. Falling back to Console-only logging.`, error);
    }

    const options: LoggerOptions = {
      level: config.LOG_LEVEL || 'info',
      format: format.json(),
      defaultMeta: {
        environment: config.ENVIRONMENT,
      },
      transports: activeTransports,
    };

    return options;
  }

  static create(): ILogger {
    const logger = createLogger(LoggerFactory.getOptions());
    return new Logger(logger);
  }
}

export { ILogger, LoggerFactory };