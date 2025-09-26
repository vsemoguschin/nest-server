import { Controller, Get, Param, Query } from '@nestjs/common';
import { VkAdsDbService } from './vk-ads.db.service';
import {
  StatisticsDayAdPlansDto,
  StatisticsDayGroupsDto,
  StatisticsDayBannersDto,
} from './dto/statistics-day.dto';
import {
  AdPlanIdParamDto,
} from './dto/ad-plans.dto';

@Controller('vk-ads')
export class VkAdsController {
  // Перевод на БД: по умолчанию читаем из VkAdsDailyStat через VkAdsDbService
  constructor(private readonly db: VkAdsDbService) {}

  // Ad Plans statistics (day) – entity fixed to ad_plans
  @Get('ad_plans/statistics/day')
  getAdPlansDay(@Query() q: StatisticsDayAdPlansDto) {
    return this.db.getAdPlansDayDb(q);
  }

  // Ad Groups statistics (day) – entity fixed to ad_groups
  // GET /vk-ads/ad_groups/statistics/day
  @Get('ad_groups/statistics/day')
  getAdGroupsDay(@Query() q: StatisticsDayGroupsDto) {
    return this.db.getAdGroupsDayDb(q);
  }

  // Banners statistics (day) – entity fixed to banners
  // GET /vk-ads/banners/statistics/day
  @Get('banners/statistics/day')
  getBannersDay(@Query() q: StatisticsDayBannersDto) {
    return this.db.getBannersDayDb(q);
  }

}
