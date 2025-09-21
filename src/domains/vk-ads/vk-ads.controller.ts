import { Controller, Get, Param, Query } from '@nestjs/common';
import { VkAdsService } from './vk-ads.service';
import {
  StatisticsDayGroupsDto,
  StatisticsDayAdPlansDto,
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
}
