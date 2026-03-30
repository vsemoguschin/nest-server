import { Module } from '@nestjs/common';
import { VkCallbackController } from './vk-callback.controller';
import { VkCallbackService } from './vk-callback.service';

@Module({
  controllers: [VkCallbackController],
  providers: [VkCallbackService],
})
export class VkCallbackModule {}
