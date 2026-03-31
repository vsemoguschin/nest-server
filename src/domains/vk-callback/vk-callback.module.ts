import { Module } from '@nestjs/common';
import { VkMessagesModule } from '../vk-messages/vk-messages.module';
import { VkCallbackController } from './vk-callback.controller';
import { VkCallbackService } from './vk-callback.service';
import { VkCallbackLoggerModule } from './logger/vk-callback-logger.module';

@Module({
  imports: [VkCallbackLoggerModule, VkMessagesModule],
  controllers: [VkCallbackController],
  providers: [VkCallbackService],
})
export class VkCallbackModule {}
