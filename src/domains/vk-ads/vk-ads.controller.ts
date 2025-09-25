import { Controller, Get, Param, Query } from '@nestjs/common';
import { VkAdsService } from './vk-ads.service';
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
  constructor(private readonly svc: VkAdsService) {}

  // Ad Plans statistics (day) – entity fixed to ad_plans
  @Get('ad_plans/statistics/day')
  getAdPlansDay(@Query() q: StatisticsDayAdPlansDto) {
    return this.svc.getAdPlansDay(q);
  }

  // Ad Plan -> Groups statistics (day)
  // GET /vk-ads/ad_plans/:id/groups/statistics/day
  @Get('ad_plans/:id/groups/statistics/day')
  getAdPlanGroupsDay(
    @Param() params: AdPlanIdParamDto,
    @Query() q: StatisticsDayGroupsDto,
  ) {
    return this.svc.getAdPlanGroupsStats(params.id, q);
  }

  // Ad Groups statistics (day) – entity fixed to ad_groups
  // GET /vk-ads/ad_groups/statistics/day
  @Get('ad_groups/statistics/day')
  getAdGroupsDay(@Query() q: StatisticsDayGroupsDto) {
    return this.svc.getAdGroupsDay(q);
  }

  // Banners statistics (day) – entity fixed to banners
  // GET /vk-ads/banners/statistics/day
  @Get('banners/statistics/day')
  getBannersDay(@Query() q: StatisticsDayBannersDto) {
    return this.svc.getBannersDay(q);
  }

}
