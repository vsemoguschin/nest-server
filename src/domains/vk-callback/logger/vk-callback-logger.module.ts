import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  VK_CALLBACK_LOGGER_CONFIG,
  VK_CALLBACK_WINSTON_LOGGER,
} from './vk-callback-logger.constants';
import { getVkCallbackLoggerConfig } from './vk-callback-logger.config';
import { createVkCallbackWinstonLogger } from './vk-callback-logger.factory';
import { VkCallbackLoggerService } from './vk-callback-logger.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: VK_CALLBACK_LOGGER_CONFIG,
      useFactory: (configService: ConfigService) =>
        getVkCallbackLoggerConfig(configService),
      inject: [ConfigService],
    },
    {
      provide: VK_CALLBACK_WINSTON_LOGGER,
      useFactory: createVkCallbackWinstonLogger,
      inject: [VK_CALLBACK_LOGGER_CONFIG],
    },
    VkCallbackLoggerService,
  ],
  exports: [VkCallbackLoggerService],
})
export class VkCallbackLoggerModule {}
