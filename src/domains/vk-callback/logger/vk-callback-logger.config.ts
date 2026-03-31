import { ConfigService } from '@nestjs/config';

export interface VkCallbackLoggerConfig {
  logDir: string;
  logPayload: boolean;
  datePattern: string;
  maxSize: string;
  maxFiles: string;
  zippedArchive: boolean;
}

const DEFAULT_VK_CALLBACK_LOG_DIR = '/var/log/easy-crm';
const DEFAULT_VK_CALLBACK_LOG_DATE_PATTERN = 'YYYY-MM-DD';
const DEFAULT_VK_CALLBACK_LOG_MAX_SIZE = '20m';
const DEFAULT_VK_CALLBACK_LOG_MAX_FILES = '30d';

export function parseBooleanEnv(value?: string | null): boolean {
  return value === 'true';
}

export function getVkCallbackLoggerConfig(
  configService: ConfigService,
): VkCallbackLoggerConfig {
  return {
    logDir:
      configService.get<string>('VK_CALLBACK_LOG_DIR')?.trim() ||
      DEFAULT_VK_CALLBACK_LOG_DIR,
    logPayload: parseBooleanEnv(
      configService.get<string>('VK_CALLBACK_LOG_PAYLOAD'),
    ),
    datePattern:
      configService.get<string>('VK_CALLBACK_LOG_DATE_PATTERN')?.trim() ||
      DEFAULT_VK_CALLBACK_LOG_DATE_PATTERN,
    maxSize:
      configService.get<string>('VK_CALLBACK_LOG_MAX_SIZE')?.trim() ||
      DEFAULT_VK_CALLBACK_LOG_MAX_SIZE,
    maxFiles:
      configService.get<string>('VK_CALLBACK_LOG_MAX_FILES')?.trim() ||
      DEFAULT_VK_CALLBACK_LOG_MAX_FILES,
    zippedArchive: !(
      configService.get<string>('VK_CALLBACK_LOG_ZIPPED_ARCHIVE') === 'false'
    ),
  };
}
