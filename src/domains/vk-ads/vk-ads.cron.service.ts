import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { format, startOfMonth, endOfMonth, subMonths, min as dfMin, subDays } from 'date-fns';
import { VkAdsStatsService } from './vk-ads.stats.service';

@Injectable()
export class VkAdsCronService {
  private readonly logger = new Logger(VkAdsCronService.name);

  constructor(private readonly stats: VkAdsStatsService) {}

  private monthRange(year: number, monthIndex0: number): { from: string; to: string } {
    const from = startOfMonth(new Date(year, monthIndex0, 1));
    const to = endOfMonth(new Date(year, monthIndex0, 1));
    // не выходим за пределы сегодняшней даты для текущего месяца
    const safeTo = dfMin([to, new Date()]);
    return { from: format(from, 'yyyy-MM-dd'), to: format(safeTo, 'yyyy-MM-dd') };
  }

  private async collectMonth(project: 'neon' | 'book', date: Date) {
    const y = date.getFullYear();
    const m = date.getMonth(); // 0..11
    const { from, to } = this.monthRange(y, m);
    this.logger.log(`[VK Ads] Collect ${project} ${from}..${to}`);
    await this.stats.collectRange(project, 'ad_plans', from, to);
    await this.stats.collectRange(project, 'ad_groups', from, to);
    await this.stats.collectRange(project, 'banners', from, to);
  }

  private lastDaysRange(days: number): { from: string; to: string } {
    const now = new Date();
    const from = subDays(now, Math.max(0, days - 1));
    return { from: format(from, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
  }

  // Каждый день в 01:00 по Москве собираем последние 5 дней
  @Cron('0 0 1 * * *', { timeZone: 'Europe/Moscow' })
  async nightlyCollector() {
    try {
      const range = this.lastDaysRange(5);
      for (const project of ['neon', 'book'] as const) {
        this.logger.log(`[VK Ads] Collect last5 ${project} ${range.from}..${range.to}`);
        await this.stats.collectRange(project, 'ad_plans', range.from, range.to);
        await this.stats.collectRange(project, 'ad_groups', range.from, range.to);
        await this.stats.collectRange(project, 'banners', range.from, range.to);
      }
    } catch (e: any) {
      this.logger.error(`VK Ads nightly collector failed: ${e?.message || e}`);
    }
  }
}
