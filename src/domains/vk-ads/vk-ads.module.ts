import { Module } from '@nestjs/common';
import { VkAdsService } from './vk-ads.service';
import { VkAdsController } from './vk-ads.controller';

@Module({
  controllers: [VkAdsController],
  providers: [VkAdsService],
  exports: [VkAdsService],
})
export class VkAdsModule {}
