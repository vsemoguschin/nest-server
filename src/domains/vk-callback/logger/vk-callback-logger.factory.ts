import { mkdirSync } from 'fs';
import { join } from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { VkCallbackLoggerConfig } from './vk-callback-logger.config';

type DailyRotateFileTransport = InstanceType<
  typeof winston.transports.DailyRotateFile
>;

const filterOutErrors = winston.format((info) => {
  if (info.level === 'error') {
    return false;
  }

  return info;
});

function bindTransportErrorHandler(
  transport: DailyRotateFileTransport,
  transportName: string,
): void {
  transport.on('error', (error) => {
    const message = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      context: 'VkCallbackLoggerFactory',
      message: 'vk_callback_logger_transport_error',
      transport: transportName,
      error: error.message,
      stack: error.stack,
    });

    process.stderr.write(`${message}\n`);
  });
}

export function createVkCallbackWinstonLogger(
  config: VkCallbackLoggerConfig,
): winston.Logger {
  mkdirSync(config.logDir, { recursive: true });

  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  );

  const eventTransport = new winston.transports.DailyRotateFile({
    dirname: config.logDir,
    filename: 'vk-callback-%DATE%.log',
    auditFile: join(config.logDir, '.vk-callback-audit.json'),
    datePattern: config.datePattern,
    maxSize: config.maxSize,
    maxFiles: config.maxFiles,
    zippedArchive: config.zippedArchive,
    format: winston.format.combine(filterOutErrors(), baseFormat),
  });

  const errorTransport = new winston.transports.DailyRotateFile({
    dirname: config.logDir,
    filename: 'vk-callback-error-%DATE%.log',
    auditFile: join(config.logDir, '.vk-callback-error-audit.json'),
    datePattern: config.datePattern,
    maxSize: config.maxSize,
    maxFiles: config.maxFiles,
    zippedArchive: config.zippedArchive,
    level: 'error',
    format: baseFormat,
  });

  bindTransportErrorHandler(eventTransport, 'vk-callback');
  bindTransportErrorHandler(errorTransport, 'vk-callback-error');

  return winston.createLogger({
    level: 'info',
    defaultMeta: {
      service: 'vk-callback',
    },
    transports: [eventTransport, errorTransport],
  });
}
