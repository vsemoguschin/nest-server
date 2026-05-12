import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { VkAdsDbService } from './vk-ads.db.service';
import { VkAdsIntegrationsService } from './vk-ads-integrations.service';
import { VkAdsAnalyticsService } from './vk-ads-analytics.service';
import {
  StatisticsDayAdPlansDto,
  StatisticsDayGroupsDto,
  StatisticsDayBannersDto,
} from './dto/statistics-day.dto';
import { AdSourcesQueryDto } from './dto/ad-sources-query.dto';
import { AdSourceExpensesQueryDto } from './dto/ad-source-expenses-query.dto';
import { AdPlansReportQueryDto } from './dto/ad-plans-report-query.dto';
import { AdPlanDealsQueryDto } from './dto/ad-plan-deals-query.dto';
@Controller('vk-ads')
export class VkAdsController {
  constructor(
    private readonly db: VkAdsDbService,
    private readonly integrations: VkAdsIntegrationsService,
    private readonly analytics: VkAdsAnalyticsService,
  ) {}

  @Get('integrations')
  listIntegrations() {
    return this.integrations.listActiveIntegrations();
  }

  @Get('ad-sources')
  listAdSources(@Query() q: AdSourcesQueryDto) {
    return this.integrations.listAdSources(q);
  }

  @Get('ad-sources/:id/expenses')
  listAdSourceExpenses(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: AdSourceExpensesQueryDto,
  ) {
    return this.integrations.listAdSourceExpenses(id, q);
  }

  @Post('ad-sources/:id/expenses')
  createAdSourceExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { date: string; price: number },
  ) {
    return this.integrations.createAdSourceExpense(id, body);
  }

  @Delete('ad-sources/expenses/:expenseId')
  deleteAdSourceExpense(@Param('expenseId', ParseIntPipe) expenseId: number) {
    return this.integrations.deleteAdSourceExpense(expenseId);
  }

  @Get('ad_plans/report')
  getAdPlansReport(@Query() q: AdPlansReportQueryDto) {
    return this.analytics.getAdPlansReport(q);
  }

  @Get('ad_plans/:adPlanId/deals')
  getAdPlanDeals(
    @Param('adPlanId', ParseIntPipe) adPlanId: number,
    @Query() q: AdPlanDealsQueryDto,
  ) {
    return this.analytics.getAdPlanDeals(adPlanId, q);
  }

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
