import { Module } from '@nestjs/common';
import { VkAdsService } from './vk-ads.service';
import { VkAdsController } from './vk-ads.controller';
import { VkAdsStatsService } from './vk-ads.stats.service';
import { VkAdsCronService } from './vk-ads.cron.service';
import { VkAdsDbService } from './vk-ads.db.service';
import { VkAdsIntegrationsService } from './vk-ads-integrations.service';

@Module({
  controllers: [VkAdsController],
  providers: [
    VkAdsService,
    VkAdsStatsService,
    VkAdsCronService,
    VkAdsDbService,
    VkAdsIntegrationsService,
  ],
  exports: [VkAdsService, VkAdsStatsService, VkAdsDbService],
})
export class VkAdsModule {}
