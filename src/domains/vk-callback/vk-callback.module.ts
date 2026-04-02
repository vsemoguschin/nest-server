import { Module } from '@nestjs/common';
import { VkMessagesModule } from '../vk-messages/vk-messages.module';
import { VkCallbackController } from './vk-callback.controller';
import { VkCallbackCustomerSyncService } from './vk-callback-customer-sync.service';
import { VkCallbackMessageCustomerSyncService } from './vk-callback-message-customer-sync.service';
import { VkCallbackService } from './vk-callback.service';
import { VkCallbackLoggerModule } from './logger/vk-callback-logger.module';

@Module({
  imports: [VkCallbackLoggerModule, VkMessagesModule],
  controllers: [VkCallbackController],
  providers: [
    VkCallbackService,
    VkCallbackCustomerSyncService,
    VkCallbackMessageCustomerSyncService,
  ],
})
export class VkCallbackModule {}
