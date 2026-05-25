import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  format,
  startOfMonth,
  endOfMonth,
  min as dfMin,
  subDays,
} from 'date-fns';
import { VkAdsStatsService } from './vk-ads.stats.service';
import { VkAdsIntegrationsService } from './vk-ads-integrations.service';

@Injectable()
export class VkAdsCronService {
  private readonly logger = new Logger(VkAdsCronService.name);
  private isRunning = false; // Защита от повторного выполнения

  constructor(
    private readonly stats: VkAdsStatsService,
    private readonly integrations: VkAdsIntegrationsService,
  ) {}

  private monthRange(
    year: number,
    monthIndex0: number,
  ): { from: string; to: string } {
    const from = startOfMonth(new Date(year, monthIndex0, 1));
    const to = endOfMonth(new Date(year, monthIndex0, 1));
    // не выходим за пределы сегодняшней даты для текущего месяца
    const safeTo = dfMin([to, new Date()]);
    return {
      from: format(from, 'yyyy-MM-dd'),
      to: format(safeTo, 'yyyy-MM-dd'),
    };
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

  private formatIntegrationLog(integration: {
    id: number;
    name?: string | null;
    projectId?: number | null;
    tokenEnvKey?: string | null;
  }) {
    return [
      `integrationId=${integration.id}`,
      `name=${String(integration.name || '').trim() || 'Без названия'}`,
      `projectId=${integration.projectId ?? 'null'}`,
      `tokenEnvKey=${String(integration.tokenEnvKey || '').trim() || 'null'}`,
    ].join(' ');
  }

  // Каждый день в 01:00 по Москве собираем последние 5 дней
  // @Cron('0 0 1 * * *', { timeZone: 'Europe/Moscow' })
  async nightlyCollector() {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[dev] skip nightlyCollector`);
      return;
    }
    // Защита от повторного выполнения
    if (this.isRunning) {
      this.logger.warn(
        '[VK Ads] Nightly collector is already running, skipping...',
      );
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      this.logger.log(
        `[VK Ads] Starting nightly collector at ${startTime.toISOString()}`,
      );

      const range = this.lastDaysRange(5);
      const integrations = await this.integrations.listActiveIntegrations();
      this.logger.log(
        `[VK Ads] Active integrations found: ${integrations.length}`,
      );
      let processed = 0;
      let skipped = 0;
      let failed = 0;

      for (const integration of integrations) {
        const tokenEnvKey = String(integration.tokenEnvKey || '').trim();
        if (!tokenEnvKey) {
          skipped++;
          this.logger.warn(
            `[VK Ads] Skip integration: ${this.formatIntegrationLog(integration)} reason=empty tokenEnvKey`,
          );
          continue;
        }

        const statsProjectKey =
          await this.integrations.resolveStatsProjectKeyByIntegrationId(
            integration.id,
        );
        if (!statsProjectKey) {
          skipped++;
          this.logger.warn(
            `[VK Ads] Skip integration: ${this.formatIntegrationLog(integration)} reason=no linked project for stats`,
          );
          continue;
        }

        try {
          await this.integrations.resolveIntegrationAuthContext(integration.id);
        } catch (error: any) {
          skipped++;
          this.logger.warn(
            `[VK Ads] Skip integration: ${this.formatIntegrationLog(integration)} reason=${error instanceof Error ? error.message : error}`,
          );
          continue;
        }

        this.logger.log(
          `[VK Ads] Start integration: ${this.formatIntegrationLog(integration)} statsProject=${statsProjectKey} range=${range.from}..${range.to}`,
        );

        try {
          this.logger.log(
            `[VK Ads] Start entity collection: integrationId=${integration.id} entity=ad_plans range=${range.from}..${range.to}`,
          );
          await this.stats.collectRange(
            statsProjectKey,
            'ad_plans',
            range.from,
            range.to,
            { integrationId: integration.id },
          );
          this.logger.log(
            `[VK Ads] Done entity collection: integrationId=${integration.id} entity=ad_plans range=${range.from}..${range.to}`,
          );
          this.logger.log(
            `[VK Ads] Start entity collection: integrationId=${integration.id} entity=ad_groups range=${range.from}..${range.to}`,
          );
          await this.stats.collectRange(
            statsProjectKey,
            'ad_groups',
            range.from,
            range.to,
            { integrationId: integration.id },
          );
          this.logger.log(
            `[VK Ads] Done entity collection: integrationId=${integration.id} entity=ad_groups range=${range.from}..${range.to}`,
          );
          this.logger.log(
            `[VK Ads] Start entity collection: integrationId=${integration.id} entity=banners range=${range.from}..${range.to}`,
          );
          await this.stats.collectRange(
            statsProjectKey,
            'banners',
            range.from,
            range.to,
            { integrationId: integration.id },
          );
          this.logger.log(
            `[VK Ads] Done entity collection: integrationId=${integration.id} entity=banners range=${range.from}..${range.to}`,
          );
          processed++;
        } catch (error: any) {
          failed++;
          this.logger.error(
            `[VK Ads] Failed integration: ${this.formatIntegrationLog(integration)} statsProject=${statsProjectKey} error=${error instanceof Error ? error.message : error}`,
          );
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.log(
        `[VK Ads] Nightly collector completed in ${duration}ms summary=active:${integrations.length} processed:${processed} skipped:${skipped} failed:${failed}`,
      );
    } catch (e: unknown) {
      this.logger.error(
        `VK Ads nightly collector failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
