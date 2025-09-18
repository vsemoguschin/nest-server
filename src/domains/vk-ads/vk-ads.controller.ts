import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { VkAdsService } from './vk-ads.service';
import { StatisticsDayDto } from './dto/statistics-day.dto';
import { GoalsDto, InappDto } from './dto/goals-inapp.dto';
import { FaststatDto } from './dto/faststat.dto';
import { OfflineConvDto } from './dto/offline-conv.dto';
import { BannersQueryDto } from './dto/banners.dto';
import { PackagesQueryDto } from './dto/packages.dto';
import { AdPlansQueryDto, AdPlanCreateDto, AdPlanGetQueryDto, AdPlanIdParamDto } from './dto/ad-plans.dto';

@Controller('vk-ads')
export class VkAdsController {
  constructor(private readonly svc: VkAdsService) {}

  // Общая статистика
  @Get('statistics/day')
  getDay(@Query() q: StatisticsDayDto) {
    return this.svc.getV3Day(q);
  }

  @Get('statistics/goals')
  getGoals(@Query() q: GoalsDto) {
    return this.svc.getGoals(q);
  }

  @Get('statistics/inapp')
  getInapp(@Query() q: InappDto) {
    return this.svc.getInapp(q);
  }

  @Get('statistics/faststat')
  getFast(@Query() q: FaststatDto) {
    return this.svc.getFaststat(q);
  }

  @Get('statistics/offline')
  getOffline(@Query() q: OfflineConvDto) {
    return this.svc.getOfflineConversions(q);
  }

  @Get('banners')
  getBanners(@Query() q: BannersQueryDto) {
    return this.svc.getBanners(q);
  }

  // Рекламные кампании (ad plans)
  @Get('ad_plans')
  getAdPlans(@Query() q: AdPlansQueryDto) {
    return this.svc.getAdPlans(q);
  }

  @Post('ad_plans')
  createAdPlan(@Body() body: AdPlanCreateDto) {
    return this.svc.createAdPlan(body);
  }

  // Single Ad Plan by ID
  @Get('ad_plans/:id')
  getAdPlan(@Param() params: AdPlanIdParamDto, @Query() q: AdPlanGetQueryDto) {
    return this.svc.getAdPlan(params.id, q);
  }
}
