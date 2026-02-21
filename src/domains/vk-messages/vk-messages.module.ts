import { Module } from '@nestjs/common';
import { VkMessagesController } from './vk-messages.controller';
import { VkMessagesProxyService } from './vk-messages.service';

@Module({
  controllers: [VkMessagesController],
  providers: [VkMessagesProxyService],
  exports: [VkMessagesProxyService],
})
export class VkMessagesModule {}
