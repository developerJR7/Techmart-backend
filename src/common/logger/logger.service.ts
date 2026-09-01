import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf((info) => {
            const timestamp =
              typeof info.timestamp === 'string' ? info.timestamp : '';
            const context =
              typeof info.context === 'string' ? info.context : 'Application';
            const message =
              typeof info.message === 'string'
                ? info.message
                : JSON.stringify(info.message);
            const trace = typeof info.trace === 'string' ? info.trace : '';
            return `${timestamp} [${context}] ${info.level}: ${message}${trace ? `\n${trace}` : ''}`;
          }),
        ),
      }),
    ];

    // File transports for production
    if (isProduction) {
      transports.push(
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      );
    }

    this.logger = winston.createLogger({
      level: isProduction ? 'info' : 'debug',
      transports,
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { context, trace });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  // Custom methods for structured logging
  logRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
  ) {
    this.logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      responseTime,
      userId,
      type: 'http',
    });
  }

  logDatabaseQuery(query: string, duration: number) {
    this.logger.debug('Database Query', {
      query,
      duration,
      type: 'database',
    });
  }

  logBusinessEvent(event: string, data: unknown) {
    this.logger.info('Business Event', {
      event,
      data,
      type: 'business',
    });
  }
}
