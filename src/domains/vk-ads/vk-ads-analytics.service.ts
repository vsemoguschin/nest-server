import { Injectable, HttpException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { VkAdsIntegrationsService } from './vk-ads-integrations.service';
import { AdPlansReportQueryDto } from './dto/ad-plans-report-query.dto';
import { AdPlanDealsQueryDto } from './dto/ad-plan-deals-query.dto';
import {
  AdPlanReportItem,
  AdPlansReportGlobalDiagnostics,
  AdPlansReportResponse,
  AdPlansReportTotals,
} from './dto/ad-plans-report-response.dto';

const NO_TAG_VALUE = 'Нет тега';

// In VK Ads API v2/v3 the ad_plan.id IS the campaign_id used in UTM macros
// {{campaign_id}} == ad_group.id (group level), NOT ad_plan.id.
// For banner fallback keys we use ad_plan.id as the "campaignId" part of
// vk_ads-<planId>-<bannerId> — this mirrors the legacy macro expansion in
// vk-ads.stats.service.ts where entity === 'ad_groups' uses entityId as campaignId.
// If your VK account uses {{campaign_id}} = ad_group.id in click URLs,
// you need the "ad_groups" entity report instead. This service is plan-level.
const FALLBACK_USES_PLAN_ID_AS_CAMPAIGN_ID = true; // documented invariant, do not remove

// All statuses included by default — deleted campaigns are shown in the report.
const DEFAULT_STATUSES: ('active' | 'blocked' | 'deleted')[] = ['active', 'blocked', 'deleted'];

@Injectable()
export class VkAdsAnalyticsService {
  private readonly logger = new Logger(VkAdsAnalyticsService.name);
  private http: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: VkAdsIntegrationsService,
  ) {
    this.http = axios.create({ timeout: 60_000 });
  }

  // ─── Public entry point ──────────────────────────────────────────────────

  async getAdPlansReport(q: AdPlansReportQueryDto): Promise<AdPlansReportResponse> {
    const dateFrom = q.date_from;
    const dateTo = q.date_to ?? dateFrom;
    const includeFallback = q.includeFallbackKeys !== false;
    const onlyWithStats = q.onlyWithStats !== false; // default true
    const limitExplicit = q.limit !== undefined;
    const limit = limitExplicit ? Math.min(q.limit!, 500) : undefined;
    const debugDeals = q.debugDeals === true;

    const statusFilter = this.resolveStatusFilter(q.status);

    this.logger.log(
      `[report:start] dateFrom=${dateFrom} dateTo=${dateTo} integrationId=${q.integrationId ?? 'n/a'} project=${q.project ?? 'n/a'} adPlanIds=${q.adPlanIds ?? 'all'} status=${statusFilter.join('+')} limit=${limit ?? 'all'} onlyWithStats=${onlyWithStats} includeFallback=${includeFallback} debugDeals=${debugDeals}`,
    );

    const auth = await this.resolveAuth(q.project, q.integrationId);
    const { token, baseUrl } = auth;

    // 1. Collect ad_plans by status filter (or explicit ids)
    const requestedPlanIds = this.parseCsvIds(q.adPlanIds);
    const { meta: planMeta, byStatus } = await this.fetchAdPlansMeta(
      token,
      baseUrl,
      requestedPlanIds,
      statusFilter,
      limit,
    );

    const totalAdPlansFetched = planMeta.size;

    if (!planMeta.size) {
      this.logger.log('[report:done] no ad_plans found, returning empty');
      return {
        dateFrom,
        dateTo,
        items: [],
        totals: this.zeroTotals(),
        diagnostics: this.zeroDiagnostics(0, 0),
      };
    }

    this.logger.log(
      `[report:meta] adPlansFetched=${totalAdPlansFetched} byStatus=${JSON.stringify(byStatus)} statusFilter=${statusFilter.join('+')}`,
    );

    let allPlanIds = Array.from(planMeta.keys());

    // 2. Fetch VK stats for plan ids (uses status-filtered list, not all)
    const statsById = await this.fetchAdPlanStats(
      allPlanIds,
      { date_from: dateFrom, date_to: dateTo },
      token,
      baseUrl,
    );

    const totalAdPlansAfterStatusFilter = allPlanIds.length;

    // 3. Filter out plans with zero stats (onlyWithStats=true by default)
    if (onlyWithStats) {
      allPlanIds = allPlanIds.filter((id) => {
        const s = statsById[id]?.total?.base;
        const shows = Number(s?.shows ?? 0) || 0;
        const clicks = Number(s?.clicks ?? 0) || 0;
        const spent = Number(s?.spent ?? s?.spend ?? 0) || 0;
        return shows > 0 || clicks > 0 || spent > 0;
      });
    }

    const totalAdPlansAfterStatsFilter = allPlanIds.length;
    this.logger.log(
      `[report:meta] afterStatusFilter=${totalAdPlansAfterStatusFilter} afterStatsFilter=${totalAdPlansAfterStatsFilter}`,
    );

    // 4. Fetch groups per plan → utmRefs per plan
    const { groupsByPlan, refsByPlan } = await this.fetchGroupsByPlanIds(
      allPlanIds,
      token,
      baseUrl,
    );

    const totalGroupCount = Object.values(groupsByPlan).reduce((s, g) => s + g.length, 0);
    this.logger.log(`[report:meta] groups=${totalGroupCount}`);

    // 5. Fetch banners per group → fallback keys per plan
    const allGroupIds = Array.from(new Set(Object.values(groupsByPlan).flat()));
    const bannersByGroup = includeFallback
      ? await this.fetchBannersByGroupIds(allGroupIds, token, baseUrl)
      : {};

    const totalBannerCount = Object.values(bannersByGroup).reduce((s, b) => s + b.length, 0);
    this.logger.log(`[report:meta] banners=${totalBannerCount}`);

    // 6. Build attribution keys and query deals per plan
    const items: AdPlanReportItem[] = [];
    let totalRefsFromUtm = 0;
    let totalFallbackKeys = 0;
    let totalMatchedDeals = 0;
    const globalSampleRefs: string[] = [];
    const globalSampleMatchedTags: string[] = [];

    // Optional debug: fetch sample DB deal tags upfront
    let sampleDbDealTags: string[] | undefined;
    let allKeysIntersectionWithDb: string[] | undefined;

    if (debugDeals) {
      sampleDbDealTags = await this.sampleDbDealTags(50);
      this.logger.log(`[report:debug] sampleDbDealTags count=${sampleDbDealTags.length}`);
    }

    // Collect all attribution keys across plans for debug intersection
    const allKeysAcrossPlans: string[] = [];

    for (const planId of allPlanIds) {
      const meta = planMeta.get(planId)!;
      const utmRefs = refsByPlan[planId] ?? [];
      const groupIds = groupsByPlan[planId] ?? [];

      // Fallback keys: for each banner in this plan's groups.
      // campaignId = planId (see FALLBACK_USES_PLAN_ID_AS_CAMPAIGN_ID comment above).
      const fallbackKeysSet = new Set<string>();
      if (includeFallback) {
        for (const gid of groupIds) {
          for (const bid of bannersByGroup[gid] ?? []) {
            fallbackKeysSet.add(String(bid));
            fallbackKeysSet.add(`vkr_${bid}`);
            fallbackKeysSet.add(`vk_ads-${planId}-${bid}`);
          }
        }
      }
      const fallbackKeys = Array.from(fallbackKeysSet);

      const allKeys = Array.from(new Set([...utmRefs, ...fallbackKeys])).filter(
        (k) => k.length > 0 && k !== NO_TAG_VALUE,
      );

      allKeysAcrossPlans.push(...allKeys);
      totalRefsFromUtm += utmRefs.length;
      totalFallbackKeys += fallbackKeys.length;

      if (utmRefs.length > 0 && globalSampleRefs.length < 20) {
        globalSampleRefs.push(...utmRefs.slice(0, 20 - globalSampleRefs.length));
      }

      // 7. Fetch deals
      const { dealsCount, dealsPrice, matchedDealTags, dealsBeforeStatusFilter } =
        await this.queryDeals(allKeys, dateFrom, dateTo);

      totalMatchedDeals += dealsCount;
      if (matchedDealTags.length > 0 && globalSampleMatchedTags.length < 20) {
        globalSampleMatchedTags.push(
          ...matchedDealTags.slice(0, 20 - globalSampleMatchedTags.length),
        );
      }

      if (allKeys.length > 0 && dealsCount === 0) {
        this.logger.warn(
          `[report:no-deals] planId=${planId} name=${meta.name ?? ''} keys=${allKeys.length} utmRefs=[${utmRefs.slice(0, 5).join(',')}] dealsBeforeStatusFilter=${dealsBeforeStatusFilter}`,
        );
      } else if (dealsCount > 0) {
        this.logger.log(
          `[report:deals] planId=${planId} dealsCount=${dealsCount} dealsPrice=${dealsPrice}`,
        );
      }

      // 8. VK spend metrics
      // spent_nds is preferred when VK returns it; fallback: spent * 1.22 (Russian VAT 22%)
      const stat = statsById[planId];
      const shows = Number(stat?.total?.base?.shows ?? 0) || 0;
      const clicks = Number(stat?.total?.base?.clicks ?? 0) || 0;
      const rawSpentNds = stat?.total?.base?.spent_nds;
      const rawSpent = Number(stat?.total?.base?.spent ?? stat?.total?.base?.spend ?? 0) || 0;
      const spentNds =
        rawSpentNds != null && Number.isFinite(Number(rawSpentNds))
          ? Number(Number(rawSpentNds).toFixed(2))
          : Number((rawSpent * 1.22).toFixed(2));

      // 9. Computed ratios
      const cpl = dealsCount > 0 ? Number((spentNds / dealsCount).toFixed(2)) : null;
      const drr = dealsPrice > 0 ? Number(((spentNds / dealsPrice) * 100).toFixed(2)) : null;

      // 10. Diagnostics
      const unmatchedRefs = allKeys.filter((k) => !matchedDealTags.includes(k));
      const bannerCount = groupIds.reduce(
        (s, gid) => s + (bannersByGroup[gid]?.length ?? 0),
        0,
      );

      items.push({
        adPlanId: planId,
        name: meta.name,
        status: meta.status,
        shows,
        clicks,
        spent: rawSpent,
        spentNds,
        dealsCount,
        dealsPrice,
        cpl,
        drr,
        diagnostics: {
          refsFromUtm: utmRefs,
          fallbackKeys,
          matchedDealTags,
          unmatchedRefs,
          groupCount: groupIds.length,
          bannerCount,
          matchedDealsBeforeStatusFilter: dealsBeforeStatusFilter,
        },
      });
    }

    if (debugDeals && sampleDbDealTags) {
      const dbTagSet = new Set(sampleDbDealTags);
      const allKeysSet = new Set(allKeysAcrossPlans);
      allKeysIntersectionWithDb = Array.from(allKeysSet).filter((k) => dbTagSet.has(k));
    }

    const totals = this.computeTotals(items);
    this.logger.log(
      `[report:done] plans=${items.length} totalDeals=${totals.dealsCount} totalSpentNds=${totals.spentNds}`,
    );

    const diagnostics: AdPlansReportGlobalDiagnostics = {
      totalAdPlansFetched,
      totalAdPlansAfterStatusFilter,
      totalAdPlansAfterStatsFilter,
      byStatus,
      totalRefsFromUtm,
      totalFallbackKeys,
      totalMatchedDeals,
      sampleRefsFromUtm: globalSampleRefs,
      sampleMatchedDealTags: globalSampleMatchedTags,
      ...(debugDeals && {
        sampleDbDealTags,
        allKeysIntersectionWithDb,
      }),
    };

    return { dateFrom, dateTo, items, totals, diagnostics };
  }

  // ─── Deal details endpoint ────────────────────────────────────────────────

  async getAdPlanDeals(adPlanId: number, q: AdPlanDealsQueryDto) {
    const dateFrom = q.date_from;
    const dateTo = q.date_to ?? dateFrom;
    const includeFallback = q.includeFallbackKeys !== false;

    const auth = await this.resolveAuth(q.project, q.integrationId);
    const { token, baseUrl } = auth;

    // Build attribution keys for this single plan
    const planMeta = await this.fetchAdPlansMeta(token, baseUrl, [adPlanId], ['active', 'blocked', 'deleted'], 1);
    const { groupsByPlan, refsByPlan } = await this.fetchGroupsByPlanIds([adPlanId], token, baseUrl);
    const groupIds = groupsByPlan[adPlanId] ?? [];
    const utmRefs = refsByPlan[adPlanId] ?? [];

    const bannersByGroup = includeFallback
      ? await this.fetchBannersByGroupIds(groupIds, token, baseUrl)
      : {};

    const fallbackKeysSet = new Set<string>();
    if (includeFallback) {
      for (const gid of groupIds) {
        for (const bid of bannersByGroup[gid] ?? []) {
          fallbackKeysSet.add(String(bid));
          fallbackKeysSet.add(`vkr_${bid}`);
          fallbackKeysSet.add(`vk_ads-${adPlanId}-${bid}`);
        }
      }
    }

    const allKeys = Array.from(new Set([...utmRefs, ...Array.from(fallbackKeysSet)])).filter(
      (k) => k.length > 0 && k !== NO_TAG_VALUE,
    );

    if (!allKeys.length) return [];

    const deals = await this.prisma.deal.findMany({
      where: {
        adTag: { in: allKeys },
        client: { firstContact: { gte: dateFrom, lte: dateTo } },
      },
      select: {
        id: true,
        title: true,
        saleDate: true,
        price: true,
        adTag: true,
        clientId: true,
        client: { select: { firstContact: true } },
        dops: { select: { price: true } },
      },
      orderBy: { id: 'desc' },
    });

    return deals
      .filter((d) => d.adTag && d.adTag !== NO_TAG_VALUE)
      .map((d) => {
        const dopsPrice = d.dops.reduce((s, dop) => s + Number(dop.price || 0), 0);
        return {
          dealId: d.id,
          title: d.title,
          saleDate: d.saleDate,
          clientFirstContact: d.client?.firstContact ?? null,
          adTag: d.adTag,
          price: Number(d.price || 0),
          dopsPrice,
          totalPrice: Number(d.price || 0) + dopsPrice,
        };
      });
  }

  // ─── Totals ───────────────────────────────────────────────────────────────

  private zeroTotals(): AdPlansReportTotals {
    return { shows: 0, clicks: 0, spent: 0, spentNds: 0, dealsCount: 0, dealsPrice: 0, cpl: null, drr: null };
  }

  private zeroDiagnostics(statusFilter: number, statsFilter: number): AdPlansReportGlobalDiagnostics {
    return {
      totalAdPlansFetched: 0,
      totalAdPlansAfterStatusFilter: statusFilter,
      totalAdPlansAfterStatsFilter: statsFilter,
      byStatus: {},
      totalRefsFromUtm: 0,
      totalFallbackKeys: 0,
      totalMatchedDeals: 0,
      sampleRefsFromUtm: [],
      sampleMatchedDealTags: [],
    };
  }

  private computeTotals(items: AdPlanReportItem[]): AdPlansReportTotals {
    let shows = 0, clicks = 0, spent = 0, spentNds = 0, dealsCount = 0, dealsPrice = 0;
    for (const it of items) {
      shows += it.shows;
      clicks += it.clicks;
      spent += it.spent;
      spentNds += it.spentNds;
      dealsCount += it.dealsCount;
      dealsPrice += it.dealsPrice;
    }
    spentNds = Number(spentNds.toFixed(2));
    const cpl = dealsCount > 0 ? Number((spentNds / dealsCount).toFixed(2)) : null;
    const drr = dealsPrice > 0 ? Number(((spentNds / dealsPrice) * 100).toFixed(2)) : null;
    return { shows, clicks, spent, spentNds, dealsCount, dealsPrice, cpl, drr };
  }

  // ─── Status filter resolution ─────────────────────────────────────────────

  private resolveStatusFilter(
    statusParam?: string,
  ): ('active' | 'blocked' | 'deleted')[] {
    if (!statusParam || statusParam === 'all') return ['active', 'blocked', 'deleted'];
    if (statusParam === 'active,blocked') return ['active', 'blocked'];
    if (statusParam === 'active') return ['active'];
    if (statusParam === 'blocked') return ['blocked'];
    if (statusParam === 'deleted') return ['deleted'];
    return DEFAULT_STATUSES;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  private async resolveAuth(
    project?: 'neon' | 'book',
    integrationId?: number,
  ): Promise<{ token: string; baseUrl: string }> {
    if (integrationId !== undefined) {
      const ctx = await this.integrations.resolveIntegrationAuthContext(integrationId);
      return { token: ctx.accessToken, baseUrl: ctx.baseUrl };
    }

    if (!project) {
      throw new HttpException(
        { code: 'ERR_WRONG_PARAMETER', message: 'project or integrationId is required' },
        400,
      );
    }

    const envKey = project === 'book' ? 'VK_ADS_BOOK_TOKEN' : 'VK_ADS_TOKEN';
    const token = String(process.env[envKey] || '').trim();
    if (!token) {
      throw new HttpException(
        { code: 'ERR_INTERNAL', message: `VK ADS token for project ${project} is not configured` },
        500,
      );
    }
    const baseUrl =
      String(process.env.VK_ADS_API_HOST || '').trim() || 'https://ads.vk.com';
    return { token, baseUrl };
  }

  // ─── VK API helpers ───────────────────────────────────────────────────────

  private async getWithRetry<T = any>(
    baseUrl: string,
    path: string,
    params: Record<string, any>,
    token: string,
    retries = 5,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        const { data } = await this.http.get(path, {
          baseURL: baseUrl,
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        return data as T;
      } catch (e: any) {
        const status = e?.response?.status;
        const isTimeout = e?.code === 'ECONNABORTED';
        const shouldRetry = status === 429 || (status >= 500 && status < 600) || isTimeout;
        if (!shouldRetry || attempt >= retries) throw e;
        const retryAfterHeader = e?.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfterHeader
          ? Math.max(0, Number(retryAfterHeader) * 1000)
          : undefined;
        const backoff = retryAfterMs ?? Math.min(8000, 500 * Math.pow(2, attempt));
        await new Promise((r) => setTimeout(r, backoff));
        attempt++;
      }
    }
  }

  private async mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let i = 0;
    const runner = async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, runner),
    );
    return results;
  }

  private parseCsvIds(csv?: string): number[] {
    if (!csv) return [];
    return String(csv)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  private extractRefFromUtm(utm?: string): string | undefined {
    if (!utm || typeof utm !== 'string') return undefined;
    try {
      for (const part of utm.split('&')) {
        const [k, v] = part.split('=');
        if (k?.trim().toLowerCase() === 'ref') {
          return decodeURIComponent((v ?? '').trim());
        }
      }
    } catch {}
    const idx = utm.indexOf('ref=');
    if (idx >= 0) {
      const rest = utm.slice(idx + 4);
      const amp = rest.indexOf('&');
      const raw = amp >= 0 ? rest.slice(0, amp) : rest;
      try {
        return decodeURIComponent(raw.trim());
      } catch {
        return raw.trim();
      }
    }
    return undefined;
  }

  // ─── VK metadata ─────────────────────────────────────────────────────────

  private async fetchAdPlansMeta(
    token: string,
    baseUrl: string,
    filterIds: number[],
    statusFilter: ('active' | 'blocked' | 'deleted')[],
    limit: number | undefined,
  ): Promise<{
    meta: Map<number, { name: string | null; status: string | null }>;
    byStatus: Record<string, number>;
  }> {
    const meta = new Map<number, { name: string | null; status: string | null }>();
    const byStatus: Record<string, number> = {};

    if (filterIds.length) {
      // Explicit ids: fetch directly, ignore status/limit
      const data = await this.getWithRetry<any>(
        baseUrl,
        '/api/v2/ad_plans.json',
        {
          fields: 'id,name,status',
          id: filterIds.join(','),
          limit: 250,
          offset: 0,
        },
        token,
      );
      for (const it of (data?.items ?? []) as any[]) {
        const id = typeof it?.id === 'number' ? it.id : Number(it?.id);
        if (Number.isFinite(id)) {
          const st = it?.status ?? null;
          meta.set(id, { name: it?.name ?? null, status: st });
          if (st) byStatus[st] = (byStatus[st] ?? 0) + 1;
        }
      }
      return { meta, byStatus };
    }

    // Enumerate all pages per status. When limit is set, stop at cap; otherwise fetch all.
    for (const st of statusFilter) {
      if (limit !== undefined && meta.size >= limit) break;
      let offset = 0;
      while (true) {
        const remaining = limit !== undefined ? limit - meta.size : 250;
        if (remaining <= 0) break;
        const batchLimit = Math.min(250, remaining);
        const data = await this.getWithRetry<any>(
          baseUrl,
          '/api/v2/ad_plans.json',
          { fields: 'id,name,status', _status: st, limit: batchLimit, offset },
          token,
        );
        const items: any[] = data?.items ?? [];
        if (!items.length) break;
        for (const it of items) {
          const id = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (Number.isFinite(id)) {
            meta.set(id, { name: it?.name ?? null, status: st });
          }
        }
        byStatus[st] = (byStatus[st] ?? 0) + items.length;
        offset += items.length;
        const count = Number(data?.count ?? 0);
        if (!count || offset >= count) break;
        if (limit !== undefined && meta.size >= limit) break;
      }
    }
    return { meta, byStatus };
  }

  private async fetchGroupsByPlanIds(
    planIds: number[],
    token: string,
    baseUrl: string,
  ): Promise<{
    groupsByPlan: Record<number, number[]>;
    refsByPlan: Record<number, string[]>;
  }> {
    const groupsByPlan: Record<number, number[]> = {};
    const refsByPlan: Record<number, string[]> = {};

    const pool = Math.max(1, Number(process.env.VK_ADS_META_POOL) || 3);
    await this.mapPool(planIds, pool, async (planId) => {
      let offset = 0;
      const groupIds: number[] = [];
      const refs: string[] = [];
      while (true) {
        const data = await this.getWithRetry<any>(
          baseUrl,
          '/api/v2/ad_groups.json',
          {
            fields: 'id,utm',
            _ad_plan_id: planId,
            _status__in: 'active,blocked,deleted',
            limit: 250,
            offset,
          },
          token,
        );
        const items: any[] = data?.items ?? [];
        if (!items.length) break;
        for (const g of items) {
          const gid = typeof g?.id === 'number' ? g.id : Number(g?.id);
          if (Number.isFinite(gid)) {
            groupIds.push(gid);
            const ref = this.extractRefFromUtm(g?.utm);
            if (ref && ref.length) refs.push(ref);
          }
        }
        offset += items.length;
        const count = Number(data?.count ?? 0);
        if (!count || offset >= count) break;
      }
      groupsByPlan[planId] = Array.from(new Set(groupIds));
      refsByPlan[planId] = Array.from(new Set(refs));
    });

    return { groupsByPlan, refsByPlan };
  }

  private async fetchBannersByGroupIds(
    groupIds: number[],
    token: string,
    baseUrl: string,
  ): Promise<Record<number, number[]>> {
    const out: Record<number, number[]> = {};
    if (!groupIds.length) return out;

    const chunkSize = 150;
    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      let offset = 0;
      while (true) {
        const data = await this.getWithRetry<any>(
          baseUrl,
          '/api/v2/banners.json',
          {
            fields: 'id,ad_group_id',
            _ad_group_id__in: chunk.join(','),
            _status__in: 'active,blocked,deleted',
            limit: 250,
            offset,
          },
          token,
        );
        const items: any[] = data?.items ?? [];
        if (!items.length) break;
        for (const b of items) {
          const gid =
            typeof b?.ad_group_id === 'number'
              ? b.ad_group_id
              : Number(b?.ad_group_id ?? b?.ad_group?.id);
          const bid = typeof b?.id === 'number' ? b.id : Number(b?.id);
          if (Number.isFinite(gid) && Number.isFinite(bid)) {
            if (!out[gid]) out[gid] = [];
            out[gid].push(bid);
          }
        }
        offset += items.length;
        const count = Number(data?.count ?? 0);
        if (!count || offset >= count) break;
      }
    }
    return out;
  }

  private async fetchAdPlanStats(
    planIds: number[],
    q: { date_from: string; date_to: string },
    token: string,
    baseUrl: string,
  ): Promise<Record<number, any>> {
    const byId: Record<number, any> = {};
    if (!planIds.length) return byId;

    const chunkSize = 150;
    const pool = Math.max(1, Number(process.env.VK_ADS_AGG_POOL) || 3);
    const chunks: number[][] = [];
    for (let i = 0; i < planIds.length; i += chunkSize) {
      chunks.push(planIds.slice(i, i + chunkSize));
    }

    await this.mapPool(chunks, pool, async (chunk) => {
      const data = await this.getWithRetry<any>(
        baseUrl,
        '/api/v3/statistics/ad_plans/day.json',
        {
          id: chunk.join(','),
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          limit: 250,
          offset: 0,
        },
        token,
      );
      for (const it of (data?.items ?? []) as any[]) {
        const id = typeof it?.id === 'number' ? it.id : Number(it?.id);
        if (Number.isFinite(id)) byId[id] = it;
      }
    });

    return byId;
  }

  // ─── Deal attribution ─────────────────────────────────────────────────────

  private async queryDeals(
    allKeys: string[],
    dateFrom: string,
    dateTo: string,
  ): Promise<{
    dealsCount: number;
    dealsPrice: number;
    matchedDealTags: string[];
    dealsBeforeStatusFilter: number;
  }> {
    if (!allKeys.length) {
      return { dealsCount: 0, dealsPrice: 0, matchedDealTags: [], dealsBeforeStatusFilter: 0 };
    }

    const deals = await this.prisma.deal.findMany({
      where: {
        adTag: { in: allKeys },
        client: { firstContact: { gte: dateFrom, lte: dateTo } },
      },
      select: { id: true, adTag: true, price: true },
    });

    if (!deals.length) {
      return { dealsCount: 0, dealsPrice: 0, matchedDealTags: [], dealsBeforeStatusFilter: 0 };
    }

    const dealIds = deals.map((d) => d.id);
    const dopSums = await this.prisma.dop.groupBy({
      by: ['dealId'],
      where: { dealId: { in: dealIds } },
      _sum: { price: true },
    });
    const dopByDealId: Record<number, number> = {};
    for (const row of dopSums) dopByDealId[row.dealId] = Number(row._sum?.price || 0);

    const seenDealIds = new Set<number>();
    const matchedTagSet = new Set<string>();
    let dealsPrice = 0;

    for (const d of deals) {
      if (seenDealIds.has(d.id)) continue;
      if (!d.adTag || d.adTag === NO_TAG_VALUE) continue;
      seenDealIds.add(d.id);
      matchedTagSet.add(d.adTag);
      dealsPrice += Number(d.price || 0) + (dopByDealId[d.id] || 0);
    }

    return {
      dealsCount: seenDealIds.size,
      dealsPrice,
      matchedDealTags: Array.from(matchedTagSet),
      dealsBeforeStatusFilter: seenDealIds.size,
    };
  }

  // ─── Debug helpers ────────────────────────────────────────────────────────

  private async sampleDbDealTags(take: number): Promise<string[]> {
    const rows = await this.prisma.deal.findMany({
      where: {
        // Prisma: notIn excludes nulls by default; also exclude empty string and sentinel value
        adTag: { notIn: ['', NO_TAG_VALUE] },
      },
      select: { adTag: true },
      take,
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => r.adTag as string).filter(Boolean);
  }
}
